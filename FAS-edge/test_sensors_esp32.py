import sensors_esp32
from sensors_esp32 import StateDebouncer

PLACED = "GAS:614,WEIGHT:510.0,TEMP:27.2,HUM:59.5"
LIFTED = "GAS:614,WEIGHT:0.6,TEMP:27.2,HUM:59.5"


def test_parse_line_reads_all_four_sensors():
    readings = sensors_esp32._parse_line(PLACED)

    assert [r["sensor_type_name"] for r in readings] == ["가스", "무게", "온도", "습도"]
    assert sensors_esp32.is_missing(readings) is False
    assert sensors_esp32.is_missing(sensors_esp32._parse_line(LIFTED)) is True


def test_first_reading_placed_only_sets_baseline():
    """기동 시 소화기가 제자리면 알리지 않는다 — 켤 때마다 이벤트가 생기지 않도록."""
    d = StateDebouncer(debounce_seconds=3)

    assert d.update(False, 0.0) is False
    assert d.update(False, 5.0) is False   # 3초 넘겨도 기준선만 잡음
    assert d.confirmed is False


def test_first_reading_missing_is_reported():
    """부팅 시점에 이미 소화기가 없으면 기준선이라도 알려야 한다 — 놓치면 영영 못 잡는다."""
    d = StateDebouncer(debounce_seconds=3)

    assert d.update(True, 0.0) is False
    assert d.update(True, 5.0) is True
    assert d.confirmed is True


def _settle(d, missing, start=0.0):
    """기준선을 잡아둔 디바운서에 상태를 충분히 오래 먹인다."""
    d.update(missing, start)
    return d.update(missing, start + 10)


def test_state_change_reports_only_after_debounce_window():
    d = StateDebouncer(debounce_seconds=3)
    _settle(d, False)                       # 거치 상태를 기준선으로

    assert d.update(True, 100.0) is False   # 이탈 관찰 시작
    assert d.update(True, 102.0) is False   # 아직 3초 안 됨
    assert d.update(True, 103.5) is True    # 3초 유지 → 확정, 알림
    assert d.confirmed is True


def test_brief_wobble_is_ignored():
    """로드셀이 임계값을 잠깐 넘었다가 돌아오면 알리지 않는다."""
    d = StateDebouncer(debounce_seconds=3)
    _settle(d, False)

    assert d.update(True, 100.0) is False   # 흔들림 시작
    assert d.update(True, 101.0) is False
    assert d.update(False, 101.5) is False  # 원래대로 복귀 — 관찰 취소
    assert d.update(True, 102.0) is False   # 다시 흔들려도 타이머는 처음부터
    assert d.update(True, 104.0) is False   # 102.0 기준이라 아직 3초 전
    assert d.confirmed is False


def test_returning_the_extinguisher_reports_again():
    d = StateDebouncer(debounce_seconds=3)
    _settle(d, False)
    assert _settle(d, True, start=100.0) is True     # 가져감

    assert _settle(d, False, start=200.0) is True    # 되돌려놓음
    assert d.confirmed is False


def test_stale_readings_are_not_served():
    """ESP32가 끊긴 뒤 오래된 값을 최신인 척 내보내지 않는다."""
    sensors_esp32._latest = sensors_esp32._parse_line(PLACED)
    sensors_esp32._latest_at = 0.0   # monotonic 기준 아주 옛날

    assert sensors_esp32.get_esp32_readings() == []


# ── 가스(화재) 판정 ────────────────────────────────────────────────────────────
FIRE = "GAS:1500,WEIGHT:510.0,TEMP:27.2,HUM:59.5"


def test_is_fire_uses_gas_threshold():
    assert sensors_esp32.is_fire(sensors_esp32._parse_line(FIRE)) is True
    assert sensors_esp32.is_fire(sensors_esp32._parse_line(PLACED)) is False


def test_is_fire_without_gas_value_is_not_fire():
    """가스 값이 없으면(ESP32 미연결 등) 판단 불가 — 화재라고 단정하지 않는다."""
    assert sensors_esp32.is_fire([{"sensor_type_name": "무게", "value": 510.0, "unit": "g"}]) is False


def test_fire_uses_the_same_debounce_rules():
    """이탈과 같은 디바운서를 쓰므로 순간 스파이크로는 경보하지 않는다."""
    d = StateDebouncer(debounce_seconds=3)
    _settle(d, False)                       # 평상을 기준선으로

    assert d.update(True, 100.0) is False   # 가스 스파이크 시작
    assert d.update(False, 101.0) is False  # 1초 만에 복귀 — 경보 없음
    assert d.confirmed is False

    assert d.update(True, 200.0) is False
    assert d.update(True, 203.5) is True    # 3초 유지 → 화재 확정
    assert d.confirmed is True


def test_fire_present_at_boot_is_reported():
    """기동 시점에 이미 가스가 임계값을 넘고 있으면 기준선이라도 알려야 한다."""
    d = StateDebouncer(debounce_seconds=3)

    assert d.update(True, 0.0) is False
    assert d.update(True, 5.0) is True
    assert d.confirmed is True
