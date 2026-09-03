#include <Adafruit_NeoPixel.h>
#include <HX711.h>
#include "DHT.h"

// ==================== 핀 및 설정 정의 ====================
// 1. 가스 센서 (화재 감지)
#define GAS_PIN 34
#define GAS_THRESHOLD 1200  // 가스 감지 기준값 (평상시 ~600 raw 기준, 오경보 줄이려 상향)

// 2. 로드셀 (HX711) — 같은 받침대를 두 지점에서 지지, 합산해서 하나의 무게값으로 사용
#define LOADCELL_DOUT_PIN 25
#define LOADCELL_SCK_PIN  26
HX711 scale;

#define LOADCELL2_DOUT_PIN 27
#define LOADCELL2_SCK_PIN  14
HX711 scale2;

// 로드셀 보정계수 (개체마다 다를 수 있어 따로 보정)
float calibration_factor  = -420.0;
float calibration_factor2 = -420.0;

// 3. WS2812B LED 스트랩
#define LED_PIN 18
#define NUM_LEDS 30  // 사용 중인 LED 개수
Adafruit_NeoPixel strip(NUM_LEDS, LED_PIN, NEO_GRB + NEO_KHZ800);

// 4. 부저
#define BUZZER_PIN 19

// 5. DHT11 온습도 센서 (모니터링용)
#define DHTPIN 4           // DHT11 DATA 핀 (확장 모듈의 D4)
#define DHTTYPE DHT11      

DHT dht(DHTPIN, DHTTYPE);

// Pi로부터 받는 비상 제어 명령 (예: "LED:ON,BUZZER:ON") — 수신 후 일정 시간 동안 자동 판단보다 우선 적용
bool overrideActive = false;
bool overrideLed = false;
bool overrideBuzzer = false;
unsigned long overrideUntil = 0;
const unsigned long OVERRIDE_HOLD_MS = 5000; // Pi가 이 시간 안에 명령을 다시 안 보내면 자동 판단으로 복귀

void setup() {
  Serial.begin(115200);

  // 가스 센서 핀 아날로그 감도 설정 (3.3V 전압 범위 전체 감지 가능)
  analogSetPinAttenuation(GAS_PIN, ADC_11db);

  // LED 초기화
  strip.begin();
  strip.show();
  strip.setBrightness(100);

  // 핀 모드 설정
  pinMode(GAS_PIN, INPUT);
  pinMode(BUZZER_PIN, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);

  // 로드셀 초기화 (2개 각각 영점/보정 후 loop에서 합산)
  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  scale.set_scale(calibration_factor);
  scale.tare();

  scale2.begin(LOADCELL2_DOUT_PIN, LOADCELL2_SCK_PIN);
  scale2.set_scale(calibration_factor2);
  scale2.tare();

  // DHT 센서 초기화
  dht.begin();

  Serial.println("==============================================");
  Serial.println("  화재 감지 & 소화기 무게/보관상태 통합 시스템  ");
  Serial.println("==============================================");
}

void loop() {
  // 0. Pi로부터 비상 제어 명령 수신 (있으면 파싱, 없으면 그냥 지나감)
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    if (cmd.length() > 0) {
      parseCommand(cmd);
    }
  }

  // 1. 센서 값 읽기
  int gasValue = analogRead(GAS_PIN);

  float weight = 0;
  if (scale.is_ready())  weight += scale.get_units(1);
  if (scale2.is_ready()) weight += scale2.get_units(1);
  if (weight < 0) weight = 0;   // 음수 방지

  // 온습도 읽기
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();

  // 2. 시리얼 출력 — Pi(sensors_esp32.py)가 파싱하는 실제 포맷: KEY:VALUE 콤마 구분
  Serial.print("GAS:");
  Serial.print(gasValue);
  Serial.print(",WEIGHT:");
  Serial.print(weight, 1);
  Serial.print(",TEMP:");
  Serial.print(isnan(temperature) ? 0.0 : temperature, 1);
  Serial.print(",HUM:");
  Serial.println(isnan(humidity) ? 0.0 : humidity, 1);

  // 3. 상태 판단 및 알림 제어
  bool overrideHold = overrideActive && (millis() < overrideUntil);

  if (overrideHold) {
    // [Pi로부터 받은 비상 명령이 유효한 동안] -> 명령대로 LED/부저 제어 (자동 판단보다 우선)
    setLEDColor(overrideLed ? 255 : 0, 0, 0);
    if (overrideBuzzer) {
      tone(BUZZER_PIN, 900);
    } else {
      noTone(BUZZER_PIN);
      digitalWrite(BUZZER_PIN, LOW);
    }
  }
  // [상태 1: 긴급 화재 감지] -> 최우선 경보 (빨간색 LED + 경보음)
  else if (gasValue > GAS_THRESHOLD) {
    setLEDColor(255, 0, 0); // 빨간색
    tone(BUZZER_PIN, 900); // 1kHz 경보음
  }
  // [상태 2: 평상시 정상 동작] -> LED 꺼짐 + 부저 끔
  else {
    setLEDColor(0, 0, 0);
    noTone(BUZZER_PIN);
    digitalWrite(BUZZER_PIN, LOW);
  }

  delay(200);
}

// Pi가 보낸 명령 문자열 파싱 (예: "LED:ON,BUZZER:ON")
void parseCommand(String cmd) {
  overrideActive = true;
  overrideLed = cmd.indexOf("LED:ON") >= 0;
  overrideBuzzer = cmd.indexOf("BUZZER:ON") >= 0;
  overrideUntil = millis() + OVERRIDE_HOLD_MS;
}

// LED 전체 색상 변경 함수
void setLEDColor(uint8_t red, uint8_t green, uint8_t blue) {
  for (int i = 0; i < NUM_LEDS; i++) {
    strip.setPixelColor(i, strip.Color(red, green, blue));
  }
  strip.show();
}