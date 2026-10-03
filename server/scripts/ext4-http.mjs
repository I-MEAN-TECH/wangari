/**
 * Read-only ext4 over HTTP range requests, straight out of an Azure managed
 * disk VHD. Built because the whole disk is throttled to ~1-2 MB/s on this
 * (disabled) subscription: pulling 30 GiB would take hours, while the few
 * hundred MB of PostgreSQL files we actually need comes back in minutes.
 *
 * Subcommands:
 *   ls    <path>                      list a directory
 *   tree  <path> <outdir>             copy a directory tree out locally
 *   cat   <path> <outfile>            copy a single file out
 *
 * Supports ext4 with extents (no legacy indirect blocks) and no inline_data.
 * Checksums are not verified — this only reads, so a bad checksum would mean
 * silent corruption we would notice as garbage output.
 *
 * Usage: node --env-file=.env scripts/ext4-http.mjs <sasUrl> <subcommand> ...
 */
import fs from "node:fs";
import path from "node:path";

const SAS = process.argv[2];
const CMD = process.argv[3];
if (!SAS || !CMD) {
  console.error("Usage: node ext4-http.mjs <sasUrl> <ls|tree|cat|stat> <path> [out]");
  process.exit(1);
}



// ── HTTP range reader with a block cache and throttling retries ────────────
const cache = new Map(); // physicalOffset -> Buffer(4096)
const BLOCK = 4096;
let fetched = 0;
let bytesFetched = 0;

async function readAt(offset, length) {
  const out = Buffer.alloc(length);
  let done = 0;
  while (done < length) {
    const off = offset + done;
    const aligned = Math.floor(off / BLOCK) * BLOCK;
    const withinBlock = off - aligned;
    const want = Math.min(BLOCK - withinBlock, length - done);
    const blk = await readBlock(aligned);
    blk.copy(out, done, withinBlock, withinBlock + want);
    done += want;
  }
  return out;
}

async function readBlock(physicalOffset) {
  const hit = cache.get(physicalOffset);
  if (hit) return hit;
  const end = physicalOffset + BLOCK - 1;
  let lastErr;
  for (let attempt = 1; attempt <= 8; attempt++) {
    try {
      const res = await fetch(`${SAS}`, {
        headers: { Range: `bytes=${physicalOffset}-${end}` },
      });
      if (res.status === 200 || res.status === 206) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === BLOCK) {
          cache.set(physicalOffset, buf);
          fetched++;
          bytesFetched += BLOCK;
          if (fetched % 2000 === 0) {
            process.stderr.write(`  ...${fetched} blocks, ${(bytesFetched / 1048576).toFixed(1)} MiB\n`);
          }
          return buf;
        }
        lastErr = new Error(`short block ${buf.length}`);
      } else {
        lastErr = new Error(`HTTP ${res.status}`);
      }
    } catch (e) {
      lastErr = e;
    }
    // This Azure account returns ServerBusy (503) under concurrency, so back off.
    await new Promise((r) => setTimeout(r, Math.min(2000 * attempt, 15000)));
  }
  throw new Error(`failed reading block at ${physicalOffset}: ${lastErr}`);
}

/** Raw ranged GET with throttling-aware retries, no block cache. */
async function rawGet(offset, length) {
  let lastErr;
  for (let attempt = 1; attempt <= 10; attempt++) {
    try {
      const res = await fetch(SAS, { headers: { Range: `bytes=${offset}-${offset + length - 1}` } });
      if (res.status === 206 || res.status === 200) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length === length) {
          fetched++;
          bytesFetched += length;
          if (fetched % 50 === 0) {
            process.stderr.write(
              `  ...${fetched} reads, ${(bytesFetched / 1048576).toFixed(1)} MiB\n`
            );
          }
          return buf;
        }
        lastErr = new Error(`short read ${buf.length}/${length}`);
      } else {
        lastErr = new Error(`HTTP ${res.status}`);
      }
    } catch (e) {
      lastErr = e;
    }
    await new Promise((r) => setTimeout(r, Math.min(1000 * attempt, 10000)));
  }
  throw new Error(`rawGet failed at ${offset} (+${length}): ${lastErr}`);
}

// ── Partition table (GPT, Gen2 Azure image) ────────────────────────────────
const sector = 512;
const firstSectors = await readAt(0, sector * 2);
let partStartSector = null;
let partEndSector = null;
// Protective MBR puts "EFI PART" at LBA1 — 8 signature bytes at offset 512.
if (firstSectors.readUInt16LE(510) === 0xaa55 && firstSectors.toString("latin1", 512, 520) === "EFI PART") {
  const gptHeader = firstSectors.subarray(sector, sector * 2);
  const entryLba = gptHeader.readBigUInt64LE(72);
  const numEntries = gptHeader.readUInt32LE(80);
  const entrySize = gptHeader.readUInt32LE(84);
  const entries = await readAt(Number(entryLba) * sector, numEntries * entrySize);
  for (let i = 0; i < numEntries; i++) {
    const e = entries.subarray(i * entrySize, (i + 1) * entrySize);
    const type = e.readBigUInt64LE(0);
    const firstLba = e.readBigUInt64LE(32);
    const lastLba = e.readBigUInt64LE(40);
    if (type === 0x83n || type === 0x8300n || (type !== 0n && firstLba > 0n)) {
      partStartSector = Number(firstLba);
      partEndSector = Number(lastLba);
      break;
    }
  }
}
if (partStartSector == null) throw new Error("no Linux partition found in GPT");
const PART = partStartSector * sector;
console.error(
  `partition: sectors ${partStartSector}..${partEndSector} (offset ${PART}, ` +
    `${(((partEndSector - partStartSector + 1) * sector) / 2 ** 30).toFixed(2)} GiB)`
);

// ── ext4 superblock ────────────────────────────────────────────────────────
const sb = await readAt(PART + 1024, 1024);
const magic = sb.readUInt16LE(0x38); // superblock magic 0xEF53, stored little-endian
if (magic !== 0xef53) throw new Error(`not ext4 (magic 0x${magic.toString(16)})`);
const logBlockSize = sb.readUInt32LE(24);
const blockSize = 1024 << logBlockSize;
const blocksCount = sb.readUInt32LE(4);
const firstDataBlock = sb.readUInt32LE(20);
const blocksPerGroup = sb.readUInt32LE(32);
const inodesPerGroup = sb.readUInt32LE(40);
const inodeSize = sb.readUInt16LE(88);
const featureIncompat = sb.readUInt32LE(96);
const featureRoCompat = sb.readUInt32LE(100);
// s_desc_size is only meaningful with the 64BIT feature. Trust the field
// whenever it holds a sane value rather than trusting the feature bit alone —
// reading 32-byte descriptors for a 64-byte filesystem silently points every
// block group at the wrong inode table.
const descSizeField = sb.readUInt16LE(0xfe);
const descSize = descSizeField >= 32 && descSizeField <= 64 ? descSizeField : 32;
const groups = Math.ceil(blocksCount / blocksPerGroup);
console.error(
  `ext4: ${blockSize}B blocks, ${blocksCount} blocks, ${groups} groups, ` +
    `inodesCount=${sb.readUInt32LE(0)}, inodesPerGroup=${inodesPerGroup}, ` +
    `blocksPerGroup=${blocksPerGroup}, inodeSize=${inodeSize}, descSize=${descSize}, ` +
    `compat=0x${sb.readUInt32LE(92).toString(16)} incompat=0x${featureIncompat.toString(16)} rocompat=0x${featureRoCompat.toString(16)}`
);
if ((featureIncompat & 0x40) !== 0 && blockSize !== 4096) {
  console.error("warning: 64bit feature with unexpected block size");
}

const FLEX_BG = (featureRoCompat & 0x2) !== 0;

// Group descriptors — read the whole table once (a few hundred KB at most).
const descTableBlocks = Math.ceil((groups * descSize) / blockSize);
const descTable = await readAt(
  PART + (firstDataBlock + 1) * blockSize,
  descTableBlocks * blockSize
);

function inodeTableBlock(group) {
  const o = group * descSize;
  let block = descTable.readUInt32LE(o + 8);
  if (descSize >= 64) block += descTable.readUInt32LE(o + 40) * 2 ** 32;
  // The meta_bg field only exists in 64-byte descriptors. With 32-byte
  // descriptors there is nothing to relocate — applying it anyway reads
  // into the next group's descriptor and corrupts the inode table offset.
  if (FLEX_BG && descSize >= 64) {
    // Meta block: bit 0 = inode table, 1 = itable_hi
    const meta = descTable.readUInt16LE(o + 0x32);
    if (!(meta & 0x1)) block += descTable.readUInt32LE(o + 0x28);
    if (meta & 0x2) block += descTable.readUInt32LE(o + 0x2c) * 2 ** 32;
  }
  return block;
}

// ── Extent mapping ─────────────────────────────────────────────────────────
const EXTENTS_FL = 0x80000;
const INLINE_DATA_FL = 0x10000000;

function parseExtentHeader(buf, off) {
  const magic = buf.readUInt16LE(off);
  if (magic !== 0xf30a) throw new Error(`bad extent magic 0x${magic.toString(16)}`);
  return {
    entries: buf.readUInt16LE(off + 2),
    max: buf.readUInt16LE(off + 4),
    depth: buf.readUInt16LE(off + 6),
  };
}

/** Map a logical block index on an inode to its physical disk block. */
async function mapBlock(inodeBuf, inodeOff, logicalBlock) {
  const p = await resolveExtent(inodeBuf, inodeOff, logicalBlock);
  return p;
}

async function resolveExtent(iBuf, iOff, logicalBlock) {
  const hdr = parseExtentHeader(iBuf, iOff);
  if (hdr.depth === 0) {
    for (let i = 0; i < hdr.entries; i++) {
      const o = iOff + 12 + i * 12;
      const eeBlock = iBuf.readUInt32LE(o);
      const eeLen = iBuf.readUInt16LE(o + 4);
      const start = iBuf.readUInt32LE(o + 8) + iBuf.readUInt16LE(o + 6) * 2 ** 32;
      const len = eeLen > 32768 ? eeLen - 32768 : eeLen; // uninitialised extent
      if (logicalBlock >= eeBlock && logicalBlock < eeBlock + len) {
        if (len === 0) return null; // preallocated but never written
        return start + (logicalBlock - eeBlock);
      }
    }
    return null;
  }
  for (let i = 0; i < hdr.entries; i++) {
    const o = iOff + 12 + i * 12;
    const eiBlock = iBuf.readUInt32LE(o);
    const leafLo = iBuf.readUInt32LE(o + 4);
    const leafHi = iBuf.readUInt16LE(o + 8);
    const nextLogical = i + 1 < hdr.entries ? iBuf.readUInt32LE(o + 12 + i * 12 + 0) : Infinity;
    if (logicalBlock >= eiBlock && logicalBlock < nextLogical) {
      const extBlock = await readAt(PART + (leafLo + leafHi * 2 ** 32) * blockSize, blockSize);
      return resolveExtent(extBlock, 0, logicalBlock);
    }
  }
  return null;
}

async function readInode(ino) {
  const group = Math.floor((ino - 1) / inodesPerGroup);
  const index = (ino - 1) % inodesPerGroup;
  const itable = inodeTableBlock(group);
  const offset = itable * blockSize + index * inodeSize;
  const buf = await readAt(PART + offset, inodeSize);
  const mode = buf.readUInt16LE(0);
  const sizeLo = buf.readUInt32LE(4);
  const flags = buf.readUInt32LE(32);
  const size = buf.readUInt32LE(108) * 2 ** 32 + sizeLo;
  return { ino, mode, size, flags, buf };
}

async function readInodeData(inode, logicalBlock) {
  const phys = await resolveExtent(inode.buf, 40, logicalBlock);
  if (phys == null) return Buffer.alloc(blockSize);
  return readAt(PART + phys * blockSize, blockSize);
}

/** Read a whole file's bytes using its extent map. */
/** Collect every extent of an inode as { logical, len, phys }. */
async function collectExtents(iBuf, iOff, out, depthGuard = 0) {
  if (depthGuard > 8) throw new Error("extent tree too deep");
  const hdr = parseExtentHeader(iBuf, iOff);
  if (hdr.depth === 0) {
    for (let i = 0; i < hdr.entries; i++) {
      const o = iOff + 12 + i * 12;
      const len = iBuf.readUInt16LE(o + 4);
      const len2 = len > 32768 ? len - 32768 : len;
      out.push({
        logical: iBuf.readUInt32LE(o),
        len: len2,
        phys: iBuf.readUInt32LE(o + 8) + iBuf.readUInt16LE(o + 6) * 2 ** 32,
      });
    }
    return out;
  }
  for (let i = 0; i < hdr.entries; i++) {
    const o = iOff + 12 + i * 12;
    const leaf = iBuf.readUInt32LE(o + 4) + iBuf.readUInt16LE(o + 8) * 2 ** 32;
    const extBlock = await readAt(PART + leaf * blockSize, blockSize);
    await collectExtents(extBlock, 0, out, depthGuard + 1);
  }
  return out;
}

// A single 4 KiB HTTP round trip per block is latency-bound and crawls against
// a throttled account. Files are almost always a few contiguous runs, so fetch
// each run as one (chunked) request through a small concurrency pool instead.
const RUN_CHUNK = 1024 * 1024;
const POOL = 6;

async function fetchRun(physBlock, lenBlocks) {
  const out = [];
  const pieces = Math.ceil((lenBlocks * blockSize) / RUN_CHUNK);
  for (let p = 0; p < pieces; p++) {
    const start = PART + physBlock * blockSize + p * RUN_CHUNK;
    const want = Math.min(RUN_CHUNK, lenBlocks * blockSize - p * RUN_CHUNK);
    out.push(start, want);
  }
  return out;
}

/** Read an inode's bytes using coalesced extents + a concurrency pool. */
async function readFileFast(inode) {
  if ((inode.flags & INLINE_DATA_FL) !== 0) throw new Error("inline_data unsupported");
  const extents = await collectExtents(inode.buf, 40, []);
  const sorted = extents.filter((e) => e.len > 0).sort((a, b) => a.logical - b.logical);

  // Logical runs, coalescing physically adjacent extents.
  const runs = [];
  for (const e of sorted) {
    const last = runs[runs.length - 1];
    if (last && last.logical + last.len === e.logical && last.phys + last.len === e.phys) {
      last.len += e.len;
    } else {
      runs.push({ logical: e.logical, len: e.len, phys: e.phys });
    }
  }

  const chunks = []; // { index, buffer }
  let index = 0;
  for (const run of runs) {
    const spec = await fetchRun(run.phys, run.len);
    for (let i = 0; i < spec.length; i += 2) {
      chunks.push({ index: index++, offset: spec[i], length: spec[i + 1] });
    }
  }

  // Prime the pool, then stream results in order.
  const results = new Array(chunks.length);
  let next = 0;
  const worker = async () => {
    while (true) {
      const i = next++;
      if (i >= chunks.length) return;
      const c = chunks[i];
      results[i] = Buffer.from(
        await rawGet(c.offset, c.length)
      );
    }
  };
  await Promise.all(Array.from({ length: Math.min(POOL, chunks.length) }, worker));

  // Splice back together, dropping anything past the inode size or inside a
  // hole (holes came back short from the HTTP layer).
  const parts = [];
  let position = 0;
  for (let i = 0; i < chunks.length; i++) {
    const c = chunks[i];
    const buf = results[i] || Buffer.alloc(c.length);
    parts.push(buf);
    position += c.length;
    if (position >= inode.size) break;
  }
  return Buffer.concat(parts).subarray(0, inode.size);
}

async function readFile(inode) {
  return readFileFast(inode);
}

const FT = { 1: "file", 2: "dir", 7: "symlink" };

async function listDir(inode) {
  const entries = [];
  const blocks = Math.ceil(inode.size / blockSize);
  for (let b = 0; b < blocks; b++) {
    let buf = await readInodeData(inode, b);
    let off = 0;
    while (off + 8 <= blockSize) {
      if (b === 0 && off === 0 && buf.readUInt32LE(0) === 2 && buf.readUInt32LE(4) === 1) {
        off += 12; // "." then ".."
      }
      const childIno = buf.readUInt32LE(off);
      const recLen = buf.readUInt16LE(off + 4);
      const nameLen = buf[off + 6];
      const fileType = buf[off + 7];
      if (recLen < 8 || off + recLen > blockSize) break;
      if (childIno !== 0) {
        const name = buf.subarray(off + 8, off + 8 + nameLen).toString("utf8");
        entries.push({ name, ino: childIno, type: fileType });
      }
      off += recLen;
    }
  }
  return entries;
}

const ROOT = 2;
async function lookup(fsPath) {
  const parts = fsPath.split("/").filter(Boolean);
  let ino = ROOT;
  for (const part of parts) {
    const inode = await readInode(ino);
    const entries = await listDir(inode);
    const found = entries.find((e) => e.name === part);
    if (!found) throw new Error(`path not found: ${fsPath} (missing "${part}")`);
    ino = found.ino;
  }
  return ino;
}

async function copyOut(ino, destPath) {
  const inode = await readInode(ino);
  if ((inode.flags & INLINE_DATA_FL) !== 0) {
    console.error(`  ! inline_data unsupported, skipping ${destPath}`);
    return false;
  }
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  const data = await readFileFast(inode);
  fs.writeFileSync(destPath, data);
  try {
    fs.chmodSync(destPath, inode.mode & 0o7777);
  } catch {}
  return true;
}

async function copyTree(ino, destDir) {
  const inode = await readInode(ino);
  if ((inode.flags & INLINE_DATA_FL) !== 0) {
    console.error(`  ! inline_data unsupported for dir, skipping ${destDir}`);
    return 0;
  }
  fs.mkdirSync(destDir, { recursive: true });
  const entries = await listDir(inode);
  let count = 0;
  for (const e of entries) {
    if (e.name === "." || e.name === "..") continue;
    const target = path.join(destDir, e.name);
    if (e.type === 2) {
      count += await copyTree(e.ino, target);
    } else if (e.type === 1) {
      await copyOut(e.ino, target);
      count++;
    } else if (e.type === 7) {
      // preserve the link itself (pg_tblspc, log symlinks)
      try {
        const child = await readInode(e.ino);
        const data = await readFile(child);
        fs.symlinkSync(data.toString("utf8"), target);
      } catch {}
    }
    if (count % 200 === 0) console.error(`  ...${count} files, ${(bytesFetched / 1048576).toFixed(1)} MiB`);
  }
  return count;
}

try {
  if (CMD === "stat") {
    const ino = await lookup(process.argv[4]);
    const inode = await readInode(ino);
    console.log(`inode=${ino} mode=0o${inode.mode.toString(8)} size=${inode.size} flags=0x${inode.flags.toString(16)}`);
    const hdr = parseExtentHeader(inode.buf, 40);
    console.log(`extent magic ok entries=${hdr.entries} max=${hdr.max} depth=${hdr.depth}`);
    for (let i = 0; i < hdr.entries; i++) {
      const o = 40 + 12 + i * 12;
      console.log(
        `  [${i}] block=${inode.buf.readUInt32LE(o)} len=${inode.buf.readUInt16LE(o + 4)} ` +
          `startHi=${inode.buf.readUInt16LE(o + 6)} startLo=${inode.buf.readUInt32LE(o + 8)}`
      );
    }
    for (let b = 0; b < Math.min(4, Math.ceil(inode.size / blockSize)); b++) {
      const data = await readInodeData(inode, b);
      if (b === 0) {
        let o2 = 0;
        while (o2 + 8 <= blockSize) {
          const ci2 = data.readUInt32LE(o2);
          const rl2 = data.readUInt16LE(o2 + 4);
          const nl2 = data[o2 + 6];
          const ft2 = data[o2 + 7];
          if (rl2 < 8 || o2 + rl2 > blockSize) break;
          console.log(
            `    @${o2} ino=${ci2} rec=${rl2} nlen=${nl2} ftype=${ft2} ` +
              `name=${JSON.stringify(data.subarray(o2 + 8, o2 + 8 + nl2).toString("utf8"))} ` +
              `hex=${data.subarray(o2, o2 + 12).toString("hex")}`
          );
          o2 += rl2;
        }
      }
      const names = [];
      let off = 0;
      while (off + 8 <= blockSize) {
        const ci = data.readUInt32LE(off);
        const rl = data.readUInt16LE(off + 4);
        const nl = data[off + 6];
        if (rl < 8 || off + rl > blockSize) break;
        if (ci !== 0) names.push(data.subarray(off + 8, off + 8 + nl).toString("utf8"));
        off += rl;
      }
      console.log(`  block ${b}: ${names.slice(0, 6).join(",")}${names.length > 6 ? ",…" : ""}`);
    }
  } else if (CMD === "ls") {
    const ino = await lookup(process.argv[4] || "/");
    for (const e of await listDir(await readInode(ino))) {
      console.log(`${e.ino}\t${FT[e.type] || e.type}\t${e.name}`);
    }
  } else if (CMD === "cat") {
    const ino = await lookup(process.argv[4]);
    fs.writeFileSync(process.argv[5], await readFile(await readInode(ino)));
  } else if (CMD === "tree") {
    const ino = await lookup(process.argv[4]);
    const n = await copyTree(ino, process.argv[5]);
    console.log(`copied ${n} files, ${(bytesFetched / 1048576).toFixed(1)} MiB fetched`);
  } else {
    throw new Error(`unknown command ${CMD}`);
  }
} finally {
  console.error(`blocks fetched: ${fetched} (${(bytesFetched / 1048576).toFixed(1)} MiB)`);
}