#!/bin/bash
# Resumable, throttling-tolerant downloader for the Azure managed-disk VHD.
# Azure returns ServerBusy/429 on this (disabled) subscription, so every chunk
# is retried with backoff and completed chunks are kept on disk. Re-running
# this script resumes where it left off.
set -u
cd /home/saasapp/recovery || exit 1

SAS=$(cat sas.txt)
TOTAL=32212255232
CHUNK=$((256 * 1024 * 1024))      # 256 MiB
STREAMS=3
NCHUNKS=$(( (TOTAL + CHUNK - 1) / CHUNK ))
mkdir -p parts

log() { echo "[$(date -u +%H:%M:%S)] $*"; }

fetch_chunk() {
  local i=$1
  local start=$(( i * CHUNK ))
  local end=$(( start + CHUNK - 1 ))
  [ $end -ge $TOTAL ] && end=$(( TOTAL - 1 ))
  local want=$(( end - start + 1 ))
  local out="parts/chunk.$(printf '%03d' $i)"
  for attempt in 1 2 3 4 5 6 7 8 9 10; do
    if [ -f "$out" ]; then
      local have=$(stat -c %s "$out")
      [ "$have" -eq "$want" ] && return 0
      rm -f "$out"
    fi
    # --speed-time/--speed-limit: abort a stalled stream so the retry happens
    # promptly instead of hanging until the SAS expires.
    if curl -sS -L --speed-limit 20480 --speed-time 60 \
          -r "${start}-${end}" -o "$out" "$SAS"; then
      local got=$(stat -c %s "$out")
      if [ "$got" -eq "$want" ]; then return 0; fi
      log "chunk $i wrong size ($got != $want), retry $attempt"
    else
      log "chunk $i attempt $attempt failed, retrying"
    fi
    rm -f "$out"
    sleep $(( attempt * 5 ))
  done
  log "chunk $i FAILED after 10 attempts"
  return 1
}

export -f fetch_chunk
export SAS TOTAL CHUNK

log "Downloading $TOTAL bytes in $NCHUNKS chunks of $CHUNK, $STREAMS parallel"

# Recompute the chunk list each run; completed chunks exit immediately.
for start_idx in $(seq 0 $STREAMS); do
  (
    for i in $(seq $start_idx $STREAMS $(( NCHUNKS - 1 ))); do
      fetch_chunk "$i"
    done
  ) &
done
wait

missing=0
for i in $(seq 0 $(( NCHUNKS - 1 ))); do
  out="parts/chunk.$(printf '%03d' $i)"
  start=$(( i * CHUNK ))
  end=$(( start + CHUNK - 1 ))
  [ $end -ge $TOTAL ] && end=$(( TOTAL - 1 ))
  want=$(( end - start + 1 ))
  [ -f "$out" ] && [ "$(stat -c %s "$out")" -eq "$want" ] || { log "MISSING chunk $i"; missing=1; }
done

if [ "$missing" -ne 0 ]; then
  log "Some chunks missing — re-run this script to resume."
  exit 1
fi

log "All chunks present, assembling osdisk.vhd"
cat parts/chunk.* > osdisk.vhd
final=$(stat -c %s osdisk.vhd)
log "assembled size=$final expected=$TOTAL"
[ "$final" -eq "$TOTAL" ] || { log "SIZE MISMATCH"; exit 1; }
rm -rf parts
log "DOWNLOAD COMPLETE"