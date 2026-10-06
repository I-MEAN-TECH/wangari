"""
Wangari feedback panel — a MiroFish/OASIS run over seven simulated personas.

WHAT THIS IS
    Seven AI personas drawn from docs/feedback-hypotheses.md are interviewed with
    the exact questions the live /feedback page asks. Their answers are OUTPUT OF A
    MODEL, NOT USER DATA. Nothing written here may be counted, averaged, shown as
    ratings, or quoted as if a farmer said it.

WHY IT IS BUILT THIS WAY
    MiroFish's default path is the Flask API, which requires a Zep Cloud key and
    runs thousands of agents across many rounds. Wangari has no Zep key and a
    ~50 req/day AI budget. But the OASIS engine underneath needs neither: the
    engine exposes an INTERVIEW manual action, so the panel is seven agents
    answering the survey instrument directly. No social rounds, no Zep, no
    graph. Cost is one request per persona.

RATE LIMIT
    UnoRouter's free tier allows ~1 request/minute account-wide, so interviews
    are paced. Results are appended to panel_results.json after each interview,
    so an interrupted run resumes instead of paying for the panel twice.
"""

import asyncio
import json
import os
import sqlite3
import sys
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
PANEL_DIR = str(HERE)
PROFILE_PATH = str(HERE / "reddit_profiles.json")
DB_PATH = str(HERE / "reddit_simulation.db")
RESULTS_PATH = str(HERE / "panel_results.json")

# Seconds between interviews. UnoRouter free tier is ~1 request/minute,
# account-wide. Being conservative here costs wall-clock and nothing else.
PACE_SECONDS = 70

# The instrument, verbatim from server/src/lib/feedback.ts. The simulation only
# means something if the personas are asked exactly what real farmers are asked.
INTERVIEW_PROMPT = """\
You are {name}. {persona}

You have just been shown a feedback form for Wangari, a farm-management app
used by farmers in Kenya. Fill it in as you actually would, in your own voice.

The form shows five faces. Read them from left to right:
1 - Haifai kabisa (it does not work at all)
2 - Inahitaji kuboreshwa (it needs improvement)
3 - Inasaidia kidogo (it helps a little)
4 - Inasaidia (it helps)
5 - Inasaidia sana (it helps a lot)

Answer in this exact format, using only the listed options:

RATING: <one number 1-5>
BEST: <one or more of these, comma separated>
  inafanya_kazi_bila_internet (works without internet)
  ni_rahisi (is easy to use)
  naona_faida (I can see my profit in KES)
  kumbukumbu (it remembers my records correctly)
  bei_na_soko (it helps with market prices)
  mifugo_na_mazao_yote (it tracks both livestock and crops)
IMPROVE: <one or more of these, comma separated>
  mafunzo (I need training)
  ugumu (it is difficult to use)
  usahihi (my numbers are wrong)
  kasi (it is slow)
  lugha (the language is confusing)
  mtandao (it needs internet)
  kipengele_hakipo (a feature is missing)
  bei_ya_mkopo (the monthly cost is too high)
  msaada (support is not available)
SPECIES: <one or more of: kuku, mifugo, mazao, samaki, nyuki>
COMMENT: <one sentence in Kiswahili, in your own words>

After that, answer these three questions honestly and briefly:
- What would have to be true for you to use Wangari every single day?
- What is the single thing you would remove or change first?
- Who else do you know who would want this?
"""


def load_env():
    """Load LLM_* from the repo-root .env, mirroring MiroFish's own convention."""
    env_file = HERE.parent / ".env"
    if not env_file.exists():
        print(f"ERROR: {env_file} not found. Run fetch-key.sh first.", file=sys.stderr)
        sys.exit(1)
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ[key.strip()] = value.strip().strip('"').strip("'")


def load_results():
    if os.path.exists(RESULTS_PATH):
        return json.loads(Path(RESULTS_PATH).read_text(encoding="utf-8"))
    return {"panel": [], "started_at": datetime.now().isoformat(), "interviews": 0}


def save_results(results):
    results["updated_at"] = datetime.now().isoformat()
    Path(RESULTS_PATH).write_text(
        json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8"
    )


def read_interview(agent_id):
    """Pull the newest INTERVIEW trace row out of the OASIS sqlite database."""
    if not os.path.exists(DB_PATH):
        return None
    try:
        conn = sqlite3.connect(DB_PATH)
        cur = conn.cursor()
        cur.execute(
            "SELECT user_id, info, created_at FROM trace "
            "WHERE action = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1",
            (str(get_action_type_value()), agent_id),
        )
        row = cur.fetchone()
        conn.close()
        if not row:
            return None
        _, info, created_at = row
        parsed = json.loads(info) if info else {}
        if isinstance(parsed, dict):
            for key in ("response", "reply", "content", "message", "info"):
                if isinstance(parsed.get(key), str) and parsed[key].strip():
                    return {"text": parsed[key], "created_at": created_at}
            # OASIS has changed this shape across versions; take any string value.
            for value in parsed.values():
                if isinstance(value, str) and len(value.strip()) > 20:
                    return {"text": value, "created_at": created_at}
        if isinstance(parsed, str) and parsed.strip():
            return {"text": parsed, "created_at": created_at}
        return None
    except Exception as exc:  # noqa: BLE001 - diagnostics only
        print(f"  (could not read trace: {exc})")
        return None


def get_action_type_value():
    from oasis import ActionType

    return ActionType.INTERVIEW.value


async def main():
    load_env()

    from camel.models import ModelFactory
    from camel.types import ModelPlatformType
    import oasis
    from oasis import ActionType, ManualAction, generate_reddit_agent_graph

    profiles = json.loads(Path(PROFILE_PATH).read_text(encoding="utf-8"))
    # SMOKE_LIMIT lets one persona be rehearsed before the panel costs anything.
    limit = int(os.environ.get("SMOKE_LIMIT", "0"))
    if limit:
        profiles = profiles[:limit]
    results = load_results()
    already_done = {row["user_id"] for row in results["panel"]}

    print("=" * 68)
    print("WANGARI FEEDBACK PANEL — SIMULATED PERSONAS, NOT USER DATA")
    print("=" * 68)
    print(f"personas: {len(profiles)}   already interviewed: {len(already_done)}")
    print(f"pace: {PACE_SECONDS}s between interviews (UnoRouter free tier)")

    model_name = os.environ.get("LLM_MODEL_NAME", "qwen3-next-80b-a3b-instruct:free")
    os.environ["OPENAI_API_KEY"] = os.environ["LLM_API_KEY"]
    base = os.environ.get("LLM_BASE_URL")
    if base:
        # camel reads the OpenAI-compatible endpoint from either name.
        os.environ["OPENAI_API_BASE_URL"] = base
        os.environ["OPENAI_BASE_URL"] = base

    print(f"\nbuilding model: {model_name}")
    model = ModelFactory.create(
        model_platform=ModelPlatformType.OPENAI, model_type=model_name
    )

    print("building agent graph...")
    agent_graph = await generate_reddit_agent_graph(
        profile_path=PROFILE_PATH,
        model=model,
        # No social actions. These personas are only ever interviewed.
        available_actions=[ActionType.DO_NOTHING],
    )

    if os.path.exists(DB_PATH):
        os.remove(DB_PATH)

    print("creating OASIS environment...")
    env = oasis.make(
        agent_graph=agent_graph,
        platform=oasis.DefaultPlatformType.REDDIT,
        database_path=DB_PATH,
        # Serialize: one request at a time is what the free tier allows.
        semaphore=1,
    )
    await env.reset()
    print("environment ready\n")

    try:
        for profile in profiles:
            uid = profile["user_id"]
            name = profile["name"]
            if uid in already_done:
                print(f"[{uid}] {name}: already interviewed, skipping")
                continue

            agent = agent_graph.get_agent(uid)
            prompt = INTERVIEW_PROMPT.format(
                name=profile["name"], persona=profile["persona"]
            )
            print(f"[{uid}] {name}: interviewing...", flush=True)
            t0 = time.time()
            error = None
            try:
                await env.step(
                    {agent: ManualAction(
                        action_type=ActionType.INTERVIEW,
                        action_args={"prompt": prompt},
                    )}
                )
            except Exception as exc:  # noqa: BLE001 - one persona must not kill the panel
                error = str(exc)[:300]
                print(f"  interview failed: {error}")

            record = {
                "user_id": uid,
                "name": name,
                "username": profile["username"],
                "profession": profile.get("profession"),
                "seconds": round(time.time() - t0, 1),
                "error": error,
            }
            if not error:
                found = read_interview(uid)
                if found:
                    record["response"] = found["text"]
                else:
                    record["error"] = "no interview trace recorded"

            results["panel"].append(record)
            results["interviews"] += 1
            save_results(results)

            if record.get("response"):
                first = record["response"].strip().splitlines()[0][:100]
                print(f"  ok in {record['seconds']}s — {first}")
            else:
                print(f"  NO ANSWER ({record.get('error')})")

            if PACE_SECONDS:
                time.sleep(PACE_SECONDS)
    finally:
        print("\nclosing environment...")
        await env.close()

    answered = [r for r in results["panel"] if r.get("response")]
    print("=" * 68)
    print(f"panel complete: {len(answered)}/{len(profiles)} answered")
    print(f"written to {RESULTS_PATH}")
    print("REMINDER: simulation output. Never user data. Never a rating.")
    print("=" * 68)


if __name__ == "__main__":
    asyncio.run(main())