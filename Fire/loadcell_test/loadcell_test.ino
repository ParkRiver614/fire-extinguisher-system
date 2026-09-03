#include <HX711.h>

#define LOADCELL_DOUT_PIN 25
#define LOADCELL_SCK_PIN  26
HX711 scale;

#define LOADCELL2_DOUT_PIN 27
#define LOADCELL2_SCK_PIN  14
HX711 scale2;

float calibration_factor  = -420.0;
float calibration_factor2 = -420.0;

void setup() {
  Serial.begin(115200);

  scale.begin(LOADCELL_DOUT_PIN, LOADCELL_SCK_PIN);
  scale.set_scale(calibration_factor);
  scale.tare();

  scale2.begin(LOADCELL2_DOUT_PIN, LOADCELL2_SCK_PIN);
  scale2.set_scale(calibration_factor2);
  scale2.tare();

  Serial.println("영점 완료. 't' 입력하면 재영점, 아무것도 안 올린 상태에서 시작하세요.");
}

void loop() {
  if (Serial.available() && Serial.read() == 't') {
    scale.tare();
    scale2.tare();
    Serial.println("재영점 완료");
  }

  float w1 = scale.is_ready()  ? scale.get_units(1)  : 0;
  float w2 = scale2.is_ready() ? scale2.get_units(1) : 0;

  Serial.print("로드셀A: "); Serial.print(w1, 2);
  Serial.print(" g | 로드셀B: "); Serial.print(w2, 2);
  Serial.print(" g | 합계: "); Serial.println(w1 + w2, 2);

  delay(300);
}
