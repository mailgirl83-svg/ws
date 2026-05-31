// gemini.js - Connects to Gemini 2.5 Flash Lite API for Pitch VAR analysis, with high-quality mock referee fallback. (Pitch-Only Optimized)

class GeminiReferee {
  constructor() {
    this.apiKey = localStorage.getItem('gemini_api_key') || '';
    this.modelName = 'gemini-2.5-flash'; 
    
    // Core prompt base incorporating the baseball rules report
    this.systemInstruction = `
당신은 학교 야구 VAR 판독 센터의 수석 AI 판독위원(Referee)입니다.
우리는 '종이공'과 '단소 배트'를 사용하여 학교에서 피칭 및 스윙 연습을 하고 있으며, 이를 판독하기 위해 특별한 KBO 기반 규칙들을 적용하고 있습니다.
주루 플레이는 없으며 오직 투구와 스윙 판독에 집중합니다.

[핵심 판독 규칙 규격]
1. 투구 속도 분류:
   - 25 km/h 이상: "빠른공 (FAST)" - 매우 위력적인 구위로 판정
   - 25 km/h 미만: "느린공 (SLOW)" - 타이밍을 뺏는 변화구성 투구로 판정
2. 자동 투구 판정 시스템 (ABS):
   - 좌우 폭: 홈플레이트 너비 43.18cm 기준 좌우 2cm씩 확장한 47.18cm 적용.
   - 높이 존: 타자 키를 기준으로 상단 55.75%, 하단 27.04%를 적용함.
   - 타자 키 예시: 150cm 타자의 경우 상단 약 83.6cm, 하단 약 40.5cm가 스트라이크 존임.
3. 플레이 판독 대상:
   - 스트라이크/볼: ABS 기준 통과 여부 및 빠른공/느린공 속도 측정.
   - 배트 닿음(스윙 터치): 스윙 시 가벼운 종이공이 스치며 미세한 궤적 굴절이 발생하여 파울이 되었는지 여부 판정.

[답변 가이드라인]
- 격식 있고 명확한 판독실 심판 어조를 유지하십시오. (예: "판독실 판정 결과를 발표합니다...")
- 판정 결과를 1~2문장의 명확한 판독 근거와 함께 제공하십시오.
- KBO 공식 규칙이나 학교 로컬 규칙의 수치를 언급하여 신뢰성을 높이십시오.
- 한국어로만 답변하고, 응답은 150자 이내의 간결한 코멘트로 작성하십시오.
`;
  }

  setApiKey(key) {
    this.apiKey = key;
    localStorage.setItem('gemini_api_key', key);
  }

  hasKey() {
    return this.apiKey && this.apiKey.trim().length > 0;
  }

  async analyzePlay(playData) {
    if (!this.hasKey()) {
      return this.generateMockVerdict(playData);
    }

    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${this.modelName}:generateContent?key=${this.apiKey}`;
    
    const requestBody = {
      contents: [
        {
          role: 'user',
          parts: [
            {
              text: `다음 경기 플레이 데이터를 판독 규칙 보고서에 기반하여 분석하고 최종 판정을 내려주십시오.\n\n플레이 데이터:\n${JSON.stringify(playData, null, 2)}`
            }
          ]
        }
      ],
      systemInstruction: {
        parts: [
          {
            text: this.systemInstruction
          }
        ]
      },
      generationConfig: {
        maxOutputTokens: 180,
        temperature: 0.3
      }
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.candidates[0].content.parts[0].text.trim();
    } catch (error) {
      console.error("Gemini API call failed, falling back to mock referee: ", error);
      return "[API 에러로 인한 로컬 판독실 긴급 판정]\n" + this.generateMockVerdict(playData);
    }
  }

  generateMockVerdict(playData) {
    const { speed, speedCategory, isStrike, isSwing, isTouchBat, batterHeight } = playData;
    
    // Calculate heights for comment
    const topLimit = (batterHeight * 0.5575).toFixed(1);
    const bottomLimit = (batterHeight * 0.2704).toFixed(1);
    
    let comments = [];
    
    if (isSwing) {
      if (isTouchBat) {
        comments = [
          `비디오 판독실 결과: 타격 시 배트 지공 부근에 종이공이 미세하게 접촉하며 공의 궤적이 상향 굴절되었습니다. 최종 파울(Foul)로 판정합니다. (구속: ${speed.toFixed(1)}km/h - ${speedCategory === 'FAST' ? '빠른공' : '느린공'})`,
          `판독 센터 통보: 스윙 시점에 종이공이 배트 모서리를 미세하게 스친 흔적이 확인되었습니다. 스윙 아웃이 아닌 파울로 판정합니다.`
        ];
      } else {
        comments = [
          `비디오 판독실 결과: 타자가 배트를 휘둘렀으나 종이공의 궤적과 배트 사이의 이격이 발생하여 접촉 없이 통과하였습니다. 원심대로 헛스윙 스트라이크를 선언합니다. (구속: ${speed.toFixed(1)}km/h ${speedCategory === 'FAST' ? '강속구' : '변화구'})`,
          `ABS 분석: 투수가 던진 ${speed.toFixed(1)}km/h의 투구에 타자가 스윙을 시도했으나 배트 끝을 비껴가며 삼진/스트라이크 판정을 유지합니다.`
        ];
      }
    } else {
      if (isStrike) {
        comments = [
          `ABS 자동 판정: 투구가 타자 신장(${batterHeight}cm) 기준 상단 ${topLimit}cm, 하단 ${bottomLimit}cm 높이의 홈플레이트 안쪽을 관통하였습니다. ${speed.toFixed(1)}km/h의 빠른 스트라이크입니다.`,
          `ABS 판정: 종이공이 플레이트 좌우 연장선(47.18cm)과 상하단 경계 존을 완벽히 지나갔음이 센서에 감지되었습니다. 판정은 스트라이크(STRIKE)입니다.`
        ];
      } else {
        comments = [
          `ABS 자동 판정: 투구가 플레이트 바깥쪽 경계(47.18cm 한계)를 벗어나 타자 신장 ${batterHeight}cm의 하단 경계인 ${bottomLimit}cm 아래로 통과하여 볼(BALL)로 판정합니다.`,
          `ABS 판독실 결과: 구속 ${speed.toFixed(1)}km/h의 투구가 스트라이크 존 상단인 ${topLimit}cm 위를 초과하여 높게 통과함에 따라 볼로 판정합니다.`
        ];
      }
    }

    const randomIndex = Math.floor(Math.random() * comments.length);
    return `[AI 판독위원 의견] ${comments[randomIndex]}`;
  }
}
