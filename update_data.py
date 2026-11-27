# -*- coding: utf-8 -*-
"""동행복권 로또 6/45 당첨번호를 받아 data.json 으로 저장한다.

이미 받은 회차는 건너뛰고 빠진 회차만 새로 받는다.
사용법:  python update_data.py

주의: 회차를 하나씩 연달아 조회하면 사이트가 한동안 응답을 끊는다.
      그래서 범위 조회(한 번에 100회차)로 몇 번만 요청한다.
"""
import json
import sys
import time
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

KST = timezone(timedelta(hours=9))

URL = "https://www.dhlottery.co.kr/lt645/selectPstLt645Info.do"
OUT = Path(__file__).resolve().parent / "data.json"
HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
    "Referer": "https://www.dhlottery.co.kr/lt645/result",
}
CHUNK = 100


def call(query="", tries=3):
    """조회 주소를 불러 회차 목록(압축된 행)을 돌려준다."""
    last = None
    for i in range(tries):
        try:
            req = urllib.request.Request(URL + query, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=30) as r:
                rows = json.loads(r.read().decode("utf-8"))["data"]["list"]
            return [[
                x["ltEpsd"], x["ltRflYmd"],
                x["tm1WnNo"], x["tm2WnNo"], x["tm3WnNo"],
                x["tm4WnNo"], x["tm5WnNo"], x["tm6WnNo"], x["bnsWnNo"],
                x.get("rnk1WnNope") or 0, x.get("rnk1WnAmt") or 0,
                x.get("rnk2WnAmt") or 0, x.get("rnk3WnAmt") or 0,
            ] for x in rows]
        except Exception as e:  # 일시적 오류는 잠깐 쉬고 다시
            last = e
            time.sleep(3 * (i + 1))
    raise RuntimeError(f"동행복권 조회 실패: {last}")


def main():
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

    have = {}
    if OUT.exists():
        try:
            for row in json.loads(OUT.read_text(encoding="utf-8"))["draws"]:
                have[row[0]] = row
        except Exception:
            have = {}

    def write():
        payload = {
            "updated": datetime.now(KST).strftime("%Y-%m-%d %H:%M"),  # 어디서 돌려도 한국 시간
            "cols": ["회차", "추첨일", "n1", "n2", "n3", "n4", "n5", "n6", "보너스",
                     "1등인원", "1등금액", "2등금액", "3등금액"],
            "draws": [have[n] for n in sorted(have)],
        }
        tmp = OUT.with_suffix(".tmp")
        tmp.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
                       encoding="utf-8")
        tmp.replace(OUT)

    try:
        newest = call()
    except RuntimeError as e:
        print(e)
        return 1
    if not newest:
        print("최신 회차를 확인하지 못했습니다.")
        return 1
    top = newest[0][0]
    missing = [n for n in range(1, top) if n not in have]
    if top in have and not missing:
        print(f"새 회차 없음 (최신 {top}회 그대로)")
        return 0
    have[top] = newest[0]
    print(f"최신 {top}회 ({newest[0][1]}), 새로 받을 회차 {len(missing)}개", flush=True)

    # 빠진 회차가 들어 있는 100회차 구간만 조회한다.
    blocks = sorted({(n - 1) // CHUNK for n in missing})
    for b in blocks:
        lo, hi = b * CHUNK + 1, min(top, (b + 1) * CHUNK)
        try:
            for row in call(f"?srchStrLtEpsd={lo}&srchEndLtEpsd={hi}"):
                have[row[0]] = row
        except RuntimeError as e:
            print(f"  {lo}~{hi}회 실패: {e}", flush=True)
            continue
        print(f"  {lo}~{hi}회 받음", flush=True)
        write()
        time.sleep(1)

    write()
    gaps = [n for n in range(1, top + 1) if n not in have]
    print(f"저장 완료: {len(have)}개 회차 → {OUT.name}")
    if gaps:
        print(f"받지 못한 회차 {len(gaps)}개: {gaps[:30]}")
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
