/*
 * 문서 개인정보 자동 가명처리 + MD·PDF 변환기  v1.6.2
 *
 * 넣는 파일: md, txt, hwp, hwpx, pdf, docx, xlsx
 *   (md·txt 외에는 kordoc으로 md 변환 후 처리)
 * 나오는 파일:
 *   <이름>_masked.md   가려진 문서
 *   <이름>_masked.pdf  가려진 부분을 노란색으로 표시한 PDF
 *   <이름>_mapping.csv 원문-가명 대조표(따로 보관)
 *   case_mapping.csv   --shared 일 때 사건 대조표(이어서 사용)
 * 외부 전송 없음. 이 컴퓨터 안에서만 처리합니다.
 *
 * 사용법: node masker.js <파일 또는 폴더> [옵션]
 *   --out <폴더>     결과 저장 폴더
 *   --style gap      인물 가명 갑·을·병 (기본)
 *   --style abc      인물 가명 A·B·C
 *   --style partial  성만 남김 (예: 홍OO)
 *   --shared         여러 파일에 같은 가명 (사건 대조표 이어쓰기)
 *   --no-map         대조표 만들지 않음
 *   --keep-age       나이는 그대로 둠
 *   --keep-biz       업체명은 그대로 둠
 *   --no-pdf         PDF 만들지 않음
 *   --no-ai          AI 이름 찾기 쓰지 않음 (ai_names.js 참고)
 *   --no-ai          AI 이름 찾기 쓰지 않음 (ai_names.js 참고)
 *   --browser "<경로>" PDF 만들 브라우저(Edge·Chrome) 직접 지정
 *   --kordoc "<명령>" kordoc 실행 명령
 *   --test           코드가 제대로 복사됐는지 점검
 *
 * 같은 폴더의 보조 파일 (UTF-8, 없어도 됨)
 *   names.txt   꼭 가릴 실명 (한 줄에 하나)
 *   exclude.txt 가리면 안 되는 낱말 (한 줄에 하나)
 */
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');
const url = require('url');

// ===== 1. 사전 =====
const SURNAMES_2 = W('황보 남궁 제갈 선우 독고 사공 서문 ');
const SURNAMES_1 =
  '김이박최정강조윤장임한오서신권황안송전홍유고문양손배' +
  '백허남심노하곽성차주우구민류나진지엄채원천방공현함변' +
  '염여추도소석선설마길연위표명기반라왕금옥육인맹제모탁' +
  '국어은편용예경봉사부';

const RANKS = W(
  '소방총감 소방정감 소방준감 소방감 소방정 소방령 소방경 ' +
    '소방위 소방장 소방교 소방사시보 소방사 행정사무관 행정주사보 ' +
    '행정주사 행정서기보 행정서기 주무관 사무관 서기관 주사보 ' +
    '주사 경위 경사 경장 순경 경감 경정 ',
);
const POSITIONS = W(
  '본부장 부서장 서장 과장 팀장 센터장 구조대장 구급대장 대장 ' +
    '계장 반장 주임 팀원 감찰관 감사관 감사담당관 조사관 수사관 ' +
    '사법경찰관 사법경찰리 대원 직원 교관 실장 국장 소장 원장 ' +
    '사장 부장 차장 대리 사원 인턴 선임 책임 수석 이사 상무 전무 ' +
    '교사 교감 교장 ',
);
const ROLES = W(
  '피감사자 감사대상자 대상자 피신고인 피신고자 신고인 신고자 ' +
    '피진정인 진정인 민원인 진술인 참고인 피의자 피해자 피고소인 ' +
    '고소인 피고발인 고발인 관계인 소유자 점유자 관리자 대표이사 ' +
    '대표자 대표 업주 행위자 위반자 운전자 작성자 담당자 확인자 ' +
    '입회인 동승자 목격자 상대방 배우자 신청인 청구인 근로자 학생 ' +
    '환자 보호자 고객 회원 진술자 제보자 제보인 조사자 ' +
    '피조사자 조사대상자 감찰대상자 징계대상자 피감찰자 면담자 ' +
    '피면담자 응답자 답변자 질문자 입회자 동석자 탑승자 구조자 ' +
    '요구조자 이송자 의뢰인 의뢰자 신청자 청구자 수령자 방문자 ' +
    '서명자 날인자 제출자 기안자 결재자 감독자 책임자 공모자 ' +
    '가담자 관련자 해당자 출석자 참석자 ',
);
const LABELS = ['성\\s?명', '이\\s?름', '성\\s?함'];
const PARTICLES = W(
  '에게서 에게는 에게 께서 으로 이고 이며 이다 이나 한테 라고 ' +
    '씨 님 은 는 이 가 을 를 의 와 과 도 만 에 로 ',
);

// 이름처럼 보이지만 이름이 아닌 낱말
const STOPWORDS = new Set(
  (
    '하지만 하물며 하여튼 하필이면 하나같이 하마터면 한편으로 한동안 ' +
    '한번은 한꺼번에 한참을 한때는 심지어 반드시 반면에 반대로 ' +
    '오히려 오로지 오직은 여전히 여태껏 나중에 나머지 나름대로 ' +
    '이어서 이러한 이처럼 이제는 이렇게 이러면 이로써 이미는 ' +
    '이를테면 이른바 이외에 이와같이 이로인해 도대체 도저히 도리어 ' +
    '도무지 정작은 정말로 정확히 정녕코 제대로 제각기 차라리 ' +
    '차츰차츰 명백히 모두가 모두는 서로가 서로는 설령은 설마하니 ' +
    '천천히 함부로 황급히 우선은 우선적 원래는 원칙적 진짜로 ' +
    '진정으로 조금씩 조차도 마침내 마저도 마치는 마땅히 고작은 ' +
    '공연히 곧바로 금방은 방금은 별도로 비로소 전혀도 전부터 주로는 ' +
    '지금은 지금도 지금까지 당연히 대체로 대략은 즉시는 결국은 ' +
    '사실은 사실상 상당히 소위는 손쉽게 신속히 안타깝게 엄격히 ' +
    '연달아 연이어 예컨대 오래전 오랫동안 온전히 왕왕은 우연히 ' +
    '유일하게 은밀히 임의로 장차는 전적으로 절대로 점차로 정식으로 ' +
    '정상적 조속히 조용히 즉각적 진작에 차례로 최대한 최소한 추후에 ' +
    '충분히 편의상 표면상 현재는 현실적 홀로는 확실히 김에는 강제로 ' +
    '강력히 고의로 고의적 공식적 구체적 구두로 권고로 기존에 남몰래 ' +
    '노골적 단순히 대신에 동시에 두루두루 마구잡이 무조건 문서로 ' +
    '방금전 백방으로 변함없이 사전에 사후에 상세히 서둘러 선제적 ' +
    '성실히 소극적 송구하게 수시로 순차적 신중히 실제로 실질적 ' +
    '안전히 양측이 어쨌든 엄중히 여러번 연속적 열심히 예전에 오전에 ' +
    '오후에 완전히 우선적 원활히 위와같이 유사시 육안으로 인위적 ' +
    '일단은 임시로 자세히 적극적 전격적 정기적 정당히 정성껏 정중히 ' +
    '제때에 조만간 종전에 주기적 지속적 직접적 진지하게 차분히 ' +
    '최근에 추가로 충실히 통상적 특별히 편하게 평소에 표준적 ' +
    '하루종일 한결같이 함께하여 합법적 현장에서 현저히 형식적 혹시나 ' +
    '확연히 황당히 효과적 ' +
    '진급자 승진자 퇴직자 임용자 전입자 전출자 신규자 해당자 ' +
    '응시자 지원자 근무자 부상자 사망자 참석자 출석자 관계자 ' +
    '소방서 경찰서 세무서 구조대 구급대 진압대 지역대 상황실 ' +
    '조사관 감사관 감찰관 수사관 대표자 이상의 이하의 이후에 ' +
    '이전에 이번에 이내에 정도의 정리를 조사를 조치를 전체를 ' +
    '신고를 장비를 안전을 소속의 전원이 전부를 문제가 문제를 ' +
    '원인을 지시를 지휘를 지원을 경고를 경우에 경위를 구조를 ' +
    '명령을 기간에 기준을 연가를 위반을 현장에 현재의 진술을 ' +
    '제출을 감사를 인원을 부서의 부당한 용도로 예방을 사실을 ' +
    '사항을 업무를 공무원 공무를 주의를 주요한 차량을 방문을 ' +
    '성실히 근무를 근무지 유지를 송부를 고발을 고소를 고지를 ' +
    '마감을 신청을 진행을 반드시 도착을 설명을 임무를 허가를 ' +
    '배치를 금지를 사용을 사용한 우선적 남은것 국민의 시민의 ' +
    '소방위 소방장 소방교 소방사 소방경 소방령 소방정 주무관 ' +
    '사무관 서기관 관계자 관계인 해당자 대상자 담당자 부산시 ' +
    '부산광 김해시 양산시 기장군 강서구 사하구 사상구 서구청 ' +
    '동구청 남구청 북구청 중구청 연제구 수영구 해운대 금정구 ' +
    '동래구 부산진 영도구 장비를 출동을 화재를 화재가 조사서 ' +
    '조사표 신고서 확인서 경위서 진술서 문답서 보고서 결과를 ' +
    '결과의 결과서 처분을 처분서 요구서 지적을 지적사 사안을 ' +
    '사건을 정당한 정상적 이상이 이상은 이하는 한편으 전반적 ' +
    '전체적 전반에 고의로 고의성 주말에 주간에 야간에 당직을 ' +
    '당직자 비번자 이하같 이하동 위와같 같은날 동일한 동일인 ' +
    '본인의 본인은 본인이 본인을 성명불 미상의 미상인 나머지 ' +
    '나머진 기존의 이외의 이전의 이후의 이상한 전원은 전원의 ' +
    '정도는 정상인 주변의 주요한 차후에 최근에 최초의 최종의 ' +
    '최대한 우선은 반대로 반면에 공식적 상기의 '
  )
    .trim()
    .split(/\s+/),
);
// 표 머리글로 자주 쓰이는 낱말(라벨 옆에 있어도 값이 아님)
const HEADER_WORDS = new Set(
  (
    '연번 순번 번호 직급 계급 직위 직명 직렬 소속 부서 성별 ' +
    '나이 연령 일시 날짜 일자 구분 내용 비고 연락처 전화 주소 ' +
    '성명 이름 생년월일 주민등록번호 처분 처분내용 결과 조치 ' +
    '위반내용 금액 수량 근무지 임용일 서명 날인 확인 담당 직책 ' +
    '직무 관계 사유 기간 장소 시간 차량번호 이메일 상호 업체명 '
  )
    .trim()
    .split(/\s+/),
);
// 3글자 후보의 끝 글자가 조사일 가능성
const RISKY_LAST = new Set('을를의에와과로도는이가으히'.split(''));
// 기관·부서 이름의 끝 글자
const BAD_LAST = new Set('대실단팀청부국'.split(''));
// 말끝(어미)처럼 보이는 끝 글자: 제출한, 서명된, 지나면, 이동시 등
// 이렇게 끝나는 3글자는 이름으로 쓰인 흔적이 있을 때만 이름으로 봄
const VERB_END = new Set('한된던할될면며시고니게려'.split(''));
// 'OO한·OO시'처럼 말끝이 붙는 흔한 낱말의 앞 두 글자
// ("지시한 과장", "이동시 팀장"은 이름이 아님)
const VERB_STEMS = new Set(
  W(
    '이동 이송 이첩 이행 이용 이관 이전 이해 이상 이탈 도착 도주 ' +
      '도입 조사 조치 조정 조회 조작 조성 조달 신고 신청 신설 ' +
      '구조 구매 구입 구성 구급 구축 정비 정리 정정 정지 정착 ' +
      '진압 진술 진행 진입 진단 진급 방문 방치 방해 방지 방송 ' +
      '연락 연기 연장 연결 하차 하달 지시 지원 지정 지급 지연 ' +
      '지적 지휘 지도 지출 제출 제공 제기 제외 제시 제보 제재 ' +
      '서명 서약 인정 인계 인수 인지 인솔 주관 주장 주의 주차 ' +
      '전달 전송 전환 전입 전출 전결 전파 고지 고발 고소 고려 ' +
      '고용 공개 공지 공유 권고 기록 기안 기재 기소 기피 남용 ' +
      '노출 누락 배정 배치 배부 반납 반려 반영 사용 사망 사과 ' +
      '사직 선정 선발 설치 설명 소집 소환 송부 송치 시행 시정 ' +
      '시작 안내 양도 예방 예약 예정 오인 우려 위반 위임 위탁 ' +
      '유출 유지 유도 은폐 임명 임용 차단 채용 추진 추가 추천 ' +
      '편성 표시 허가 확인 보고 출동 도움 근무 발생 점검 감독',
  ),
);
// 소방 계급: 바로 뒤에 오는 말은 이름으로 봄 (소방장 홍길동)
// 이름 뒤 직위: 바로 앞에 오는 말은 이름으로 봄 (홍길동 반장)
const NAME_POS = W(
  '반장 주임 계장 과장 팀장 센터장 대장 구조대장 구급대장 ' +
    '실장 서장 본부장 부서장 소장 대원 주무관',
);

// 표에서 라벨 -> 값 종류
function lab(flags, ...alts) {
  return new RegExp('^(' + alts.join('|') + ')$', flags);
}
const CELL_LABELS = [
  [
    'name',
    lab(
      '',
      String.raw`성\s*명`,
      String.raw`이\s*름`,
      String.raw`성\s*함`,
      String.raw`성명\(한글\)`,
      String.raw`한글\s*성명`,
      String.raw`피\s*감\s*사\s*자`,
      String.raw`감사\s*대상자`,
      String.raw`대\s*상\s*자`,
      String.raw`신\s*고\s*인`,
      String.raw`신고자`,
      String.raw`피신고인`,
      String.raw`피신고자`,
      String.raw`진정인`,
      String.raw`피진정인`,
      String.raw`민원인`,
      String.raw`진\s*술\s*인`,
      String.raw`참\s*고\s*인`,
      String.raw`피\s*의\s*자`,
      String.raw`피\s*해\s*자`,
      String.raw`고소인`,
      String.raw`피고소인`,
      String.raw`고발인`,
      String.raw`피고발인`,
      String.raw`작\s*성\s*자`,
      String.raw`담\s*당\s*자`,
      String.raw`확\s*인\s*자`,
      String.raw`입\s*회\s*인`,
      String.raw`대\s*표\s*자`,
      String.raw`대표이사`,
      String.raw`소\s*유\s*자`,
      String.raw`관\s*계\s*인`,
      String.raw`위\s*반\s*자`,
      String.raw`행\s*위\s*자`,
      String.raw`운\s*전\s*자`,
      String.raw`점\s*유\s*자`,
      String.raw`관\s*리\s*자`,
    ),
  ],
  [
    'org',
    lab(
      '',
      String.raw`소\s*속`,
      String.raw`소속\s*기관`,
      String.raw`근\s*무\s*처`,
      String.raw`근무\s*부서`,
      String.raw`직\s*장`,
      String.raw`소속\s*\(?부서\)?`,
    ),
  ],
  [
    'phone',
    lab(
      '',
      String.raw`연\s*락\s*처`,
      String.raw`전\s*화(\s*번\s*호)?`,
      String.raw`휴\s*대\s*(전화|폰)`,
      String.raw`핸\s*드\s*폰`,
      String.raw`휴대폰\s*번호`,
      String.raw`사무실\s*전화`,
      String.raw`자택\s*전화`,
    ),
  ],
  [
    'addr',
    lab(
      '',
      String.raw`주\s*소`,
      String.raw`주\s*소\s*지`,
      String.raw`거\s*주\s*지`,
      String.raw`실\s*거\s*주\s*지`,
      String.raw`자택\s*주소`,
      String.raw`등록기준지`,
      String.raw`본\s*적`,
      String.raw`소\s*재\s*지`,
      String.raw`사업장\s*주소`,
    ),
  ],
  [
    'id',
    lab(
      '',
      String.raw`주민\s*등록\s*번호`,
      String.raw`주민\s*번호`,
      String.raw`생\s*년\s*월\s*일`,
      String.raw`외국인\s*등록\s*번호`,
      String.raw`여권\s*번호`,
      String.raw`운전\s*면허\s*번호`,
      String.raw`공무원\s*번호`,
      String.raw`사\s*번`,
    ),
  ],
  [
    'email',
    lab(
      'i',
      String.raw`이\s*메\s*일`,
      String.raw`e-?mail`,
      String.raw`전자\s*우편`,
    ),
  ],
  [
    'biz',
    lab(
      '',
      String.raw`상\s*호`,
      String.raw`상\s*호\s*명`,
      String.raw`업\s*체\s*명`,
      String.raw`업\s*소\s*명`,
      String.raw`사업장\s*명`,
      String.raw`대상물\s*명`,
      String.raw`건\s*물\s*명`,
      String.raw`법\s*인\s*명`,
      String.raw`회\s*사\s*명`,
    ),
  ],
  [
    'acct',
    lab(
      '',
      String.raw`계\s*좌(\s*번\s*호)?`,
      String.raw`입금\s*계좌`,
      String.raw`은\s*행\s*계\s*좌`,
    ),
  ],
];

const ORG_SUFFIX = W(
  '119시민수상구조대 119특수구조대 119화학구조대 119수난구조대 ' +
    '119산악구조대 119안전센터 119구조대 119구급대 119지역대 ' +
    '안전센터 특수구조대 구조대 구급대 지역대 소방파출소 소방서 ' +
    '경찰서 지구대 파출소 행정복지센터 주민센터 보건소 세무서 ' +
    '우체국 출장소 사업소 시청 구청 군청 초등학교 중학교 고등학교 ',
);
const ORG_PREFIX_EXCLUDE = new Set(
  W(
    '관할 해당 각 일선 전 타 인근 소속 우리 당 본 다른 모든 ' +
      '전국 시 도 지방 국가 같은 동일 해당소방 및 또는 그 이 각급 ' +
      '산하 예하 재 생 실 녹화 다시 방송 각급 관내 인근의 서울 ' +
      '부산 대구 인천 광주 대전 울산 세종 경기 강원 충북 충남 ' +
      '전북 전남 경북 경남 제주 ' +
      // 성별·직책·경력 등 꾸미는 말 (선임구급대원, 여자구조대원 등)
      '선임 후임 여자 남자 여성 남성 남녀 신규 신임 신입 초임 ' +
      '수석 일반 전담 담당 현장 특수 응급 화재 정규 임시 보조 ' +
      '예비 의무 행정 지원 전문 우수 모범 기존 전체 일부 소방 ' +
      '의용 민간 상근 야간 주간 당번 비번 교대 숙련 견습 실습 ' +
      '파견 전입 전출 퇴직 현직 신참 고참 막내 ',
  ),
);

const PERSON_CODES = {
  gap: '갑을병정무기경신임계'.split(''),
  abc: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
};

// ===== 2. 정규식 =====
// 띄어쓰기로 구분한 낱말 목록을 배열로
function W(text) {
  return text.trim().split(/\s+/);
}
function rx(flags, ...parts) {
  return new RegExp(parts.join(''), flags);
}
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const alt = arr =>
  [...arr].sort((a, b) => b.length - a.length).join('|');
const H = '가-힣';
const NAME3 =
  `(?:${SURNAMES_2.join('|')})[${H}]{1,2}` +
  `|[${SURNAMES_1}][${H}]{2}`;
const NAME_ANY = `(?:${SURNAMES_2.join('|')})[${H}]{1,2}|[${H}]{2,4}`;
const END = `(?=(?:${alt(PARTICLES)}){0,2}(?![${H}]))`;
const TITLES = alt([...RANKS, ...POSITIONS, ...ROLES]);
const FIRE_RANKS = alt(RANKS.filter(r => r.startsWith('소방')));
// 이름 바로 뒤에 붙는 말 (조사 + 입니다·부터·까지·께 등)
const TAIL =
  String.raw`(?=(?:${alt(PARTICLES)}){0,2}(?![${H}])` +
  String.raw`|입니|이었|였|이라|라는|이랑|랑|부터|까지|처럼|하고|` +
  String.raw`보다|께|에서|등|외|및|로부터|으로부터|이시|이세)`;

const RE = {
  // 직급/직위/역할 + 이름 : "소방위 홍길동", "피의자 홍길동은"
  titleName: rx(
    'g',
    String.raw`(?:지방)?(?:${TITLES})`,
    String.raw`(?:\s+|\s*[:：]\s*)`,
    String.raw`(?<![${H}])(${NAME3})${TAIL}`,
  ),
  // 소방 계급 + 이름 : "소방장 홍길동입니다", "소방장홍길동"
  rankName: rx(
    'g',
    String.raw`(?:지방)?(?:${FIRE_RANKS})(?!시보)`,
    String.raw`\s*[:：]?\s*(${NAME3})${TAIL}`,
  ),
  // 이름 + 직위 : "홍길동 반장", "홍길동 과장이"
  namePos: rx(
    'g',
    String.raw`(?<![${H}])(${NAME3})`,
    String.raw`(?:\s*\(\s*|\s+)(?:지방)?`,
    String.raw`(?:${FIRE_RANKS}|${alt(NAME_POS)})`,
  ),
  // 이름 + 직급 : "홍길동 소방위", "홍길동(소방위)"
  nameTitle: rx(
    'g',
    String.raw`(?<![${H}])(${NAME3})`,
    String.raw`(?:\s*\(\s*|\s+)`,
    String.raw`(?:지방)?(?:${TITLES})`,
  ),
  // 이름 + 씨/님
  nameHon: rx(
    'g',
    String.raw`(?<![${H}])(${NAME3})`,
    String.raw`\s?(?:씨|님)${END}`,
  ),
  // 이름(52세) / 이름(남, 52세) / 이름(740305-...)
  nameAge: rx(
    'g',
    String.raw`(?<![${H}])(${NAME3})\s*\(\s*`,
    String.raw`(?:[남여](?:자|성)?\s*[,·/]\s*)?`,
    String.raw`(?:만\s*)?(?:\d{1,3}\s*세|\d{6})`,
  ),
  // 성명: 홍길동 (2~4글자 허용)
  label: rx(
    'g',
    String.raw`(?:${LABELS.join('|')})`,
    String.raw`\s*[:：]\s*(${NAME_ANY})${END}`,
  ),

  rrn: rx(
    'g',
    String.raw`(?<!\d)\d{2}(?:0[1-9]|1[0-2])`,
    String.raw`(?:0[1-9]|[12]\d|3[01])`,
    String.raw`\s?-\s?[1-8][\d*]{6}(?!\d)`,
  ),
  mobile: /(?<!\d)01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}(?!\d)/g,
  landline: rx(
    'g',
    String.raw`(?<![\d-])0(?:2|[3-6][1-5]|70|505|50\d)`,
    String.raw`[-.)\s]\s?\d{3,4}[-.\s]\d{4}(?!\d)`,
  ),
  email: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g,
  car: rx(
    'g',
    String.raw`(?<![\d가-힣])\d{2,3}\s?`,
    String.raw`[가나다라마거너더러머버서어저고노도로모보소오조`,
    String.raw`구누두루무부수우주아바사자배하허호]`,
    String.raw`\s?\d{4}(?!\d)`,
  ),
  acctCtx: rx(
    'g',
    String.raw`((?:계좌(?:번호)?|통장|입금처)[^\n\d]{0,15})`,
    String.raw`(\d[\d-]{8,20}\d)`,
  ),
  acctGeneric: rx(
    'g',
    String.raw`(?<![\d-])\d{2,6}-\d{2,6}-\d{2,7}`,
    String.raw`(?:-\d{1,3})?(?![\d-])`,
  ),
  birth: rx(
    'g',
    String.raw`((?:생년월일|생일|출생)\s*[:：]?\s*)`,
    String.raw`(\d{2,4}\s?[.\-/년]\s?\d{1,2}\s?`,
    String.raw`[.\-/월]\s?\d{1,2}\s?일?\.?)`,
  ),
  addrLine: rx(
    'g',
    String.raw`((?:주\s?소|주소지|거주지|실거주지|자택`,
    String.raw`|등록기준지|본적)\s*[:：]\s*)`,
    String.raw`([^\n|<]{4,})`,
  ),
  road: rx(
    'g',
    String.raw`[가-힣A-Za-z0-9]+(?:대로|로|길)\s?\d{1,5}`,
    String.raw`(?:번길\s?\d{1,5})?(?:-\d{1,5})?`,
    String.raw`(?![\d가-힣%])`,
    String.raw`(?!\s?(?:개|명|대|건|회|번째|미터|m|km`,
    String.raw`|분|시간|일|층|%|호선))`,
  ),
  jibun: rx(
    'g',
    String.raw`(?<![가-힣])[가-힣]{1,6}(?:동|리)`,
    String.raw`\s?\d{1,5}(?:-\d{1,5}|\s?번지)`,
  ),
  aptUnit: /(?<!\d)\d{1,4}\s?동\s?\d{1,5}\s?호/g,
  age: /(?<![\d.])(만\s?)?\d{2}\s?세(?=[\s,)\]·/.]|$)/g,
  org: new RegExp(`(?<![${H}])([${H}]{1,6}?)(${alt(ORG_SUFFIX)})`, 'g'),
};

// ===== 3. 사건(컨텍스트) =====
// 가린 자리 표시(PDF에서 노란색으로 칠할 곳). md에는 남기지 않음
const MK_OPEN = String.fromCharCode(0xe000);
const MK_CLOSE = String.fromCharCode(0xe001);
const unmark = s => s.split(MK_OPEN).join('').split(MK_CLOSE).join('');
function mk(ctx, s) {
  return ctx.mark ? MK_OPEN + s + MK_CLOSE : s;
}
// 앞뒤 빈칸은 두고 내용만 표시
function mkTrim(ctx, s) {
  const m = s.match(/^(\s*)([\s\S]*?)(\s*)$/);
  return m[2] ? m[1] + mk(ctx, m[2]) + m[3] : s;
}

function newContext(style) {
  return {
    style,
    mark: false,
    persons: new Map(), // 실명 -> 가명
    orgs: new Map(), // 기관명 -> 가명
    orgCount: {},
    biz: new Map(), // 업체명 -> 가명
    addrs: new Map(), // 주소 문자열 -> [주소]
    counts: {},
  };
}
const bump = (ctx, k, n = 1) => {
  ctx.counts[k] = (ctx.counts[k] || 0) + n;
};

function personCode(ctx, name) {
  if (ctx.persons.has(name)) return ctx.persons.get(name);
  let code;
  if (ctx.style === 'partial') {
    const sur = SURNAMES_2.find(s => name.startsWith(s)) || name[0];
    code = sur + '○'.repeat(name.length - sur.length);
  } else {
    const list = PERSON_CODES[ctx.style] || PERSON_CODES.gap;
    const used = new Set(ctx.persons.values());
    const nth = i =>
      list[i % list.length] +
      (i >= list.length ? String(Math.floor(i / list.length) + 1) : '');
    let i = ctx.persons.size;
    while (used.has(nth(i))) i++; // 대조표에 이미 쓴 가명은 건너뜀
    code = nth(i);
  }
  ctx.persons.set(name, code);
  return code;
}
// 가명 끝소리 받침: 0 없음, 1 있음, 2 ㄹ받침
// (조사 은/는, 이/가, 을/를, 과/와, 으로/로 맞춤)
function batchim(word) {
  const s = word.replace(/[\]\s)]+$/, '');
  const ch = s[s.length - 1];
  if (!ch) return -1;
  const c = ch.charCodeAt(0);
  if (c >= 0xac00 && c <= 0xd7a3) {
    const j = (c - 0xac00) % 28;
    return j === 0 ? 0 : j === 8 ? 2 : 1;
  }
  if (/\d/.test(ch))
    return '178'.includes(ch) ? 2 : '036'.includes(ch) ? 1 : 0;
  if (/[A-Za-z]/.test(ch))
    return /[LlRr]/.test(ch) ? 2 : /[MmNn]/.test(ch) ? 1 : 0;
  return -1; // 판단 불가(동그라미 등) -> 원래 조사 유지
}
const PAIRS = {
  은: ['는', '은', '은'],
  는: ['는', '은', '은'],
  이: ['가', '이', '이'],
  가: ['가', '이', '이'],
  을: ['를', '을', '을'],
  를: ['를', '을', '을'],
  과: ['와', '과', '과'],
  와: ['와', '과', '과'],
  으로: ['로', '으로', '로'],
  로: ['로', '으로', '로'],
};
function replaceWithParticle(text, from, to, ctx) {
  let n = 0;
  const b = batchim(to);
  const shown = ctx ? mk(ctx, to) : to;
  const re = rx(
    'g',
    esc(from),
    String.raw`(\([^)\n]{0,20}\))?`,
    String.raw`(?:(으로|은|는|이|가|을|를|과|와|로)`,
    String.raw`(?![가-힣]))?`,
  );
  const out = text.replace(re, (m, paren, p) => {
    n++;
    const fixed = p && b >= 0 ? PAIRS[p][b] : p || '';
    return shown + (paren || '') + fixed;
  });
  return [out, n];
}
function letter(i) {
  return (
    'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i % 26] +
    (i >= 26 ? String(Math.floor(i / 26) + 1) : '')
  );
}

// ===== 4. 이름 수집 =====
function validName(n, exclude, strong) {
  if (!n || n.length < 2 || n.length > 4) return false;
  if (exclude.has(n) || STOPWORDS.has(n) || HEADER_WORDS.has(n))
    return false;
  if (RANKS.includes(n) || POSITIONS.includes(n) || ROLES.includes(n))
    return false;
  if (
    BAD_LAST.has(n[n.length - 1]) &&
    strong !== true &&
    strong !== 'rank'
  )
    return false;
  if (strong !== true && n.length === 3 && RISKY_LAST.has(n[2]))
    return false;
  const NOT_NAME = W(
    '성명 이름 성함 미상 불상 생략 없음 해당없음 ' +
      '본인 기타 비고 합계 계',
  );
  if (NOT_NAME.includes(n)) return false;
  return true;
}

// 이름처럼 쓰인 흔적이 문서 안에 있는가 (문맥 확인)
// - 뒤에 조사·씨·님·괄호가 바로 붙음: 홍길동은, 홍길동 씨, 홍길동(52세)
// - 직급 뒤 명단처럼 나열됨: 소방장 홍길동, / 소방장 홍길동. / 줄 끝
function usedAsName(text, n) {
  // 사람 뒤에 붙는 조사 (두 개까지 이어 붙어도 됨: 에게도, 에게는)
  const P = '은|는|이|가|을|를|의|에게서|에게|께서|한테|과|와|도|만';
  const attached = rx(
    '',
    esc(n),
    String.raw`(?:\s?(?:씨|님)|\(|(?:${P}){1,2}(?![가-힣]))`,
  );
  const listed = rx(
    'm',
    String.raw`(?:${TITLES})\s*[:：]?\s*`,
    esc(n),
    String.raw`(?=\s*(?:[,.·/;)\]]|$))`,
  );
  return attached.test(text) || listed.test(text);
}

function collectNames(text, exclude, forced) {
  const found = new Map(); // name -> first index
  const add = (n, idx, strong) => {
    if (!validName(n, exclude, strong)) return;
    // 말끝처럼 끝나면 문맥 확인: 이름으로 쓰인 흔적이 있어야 함
    // ("차량 이동시 팀장", "기간이 지나면 담당자" 등을 거름)
    const verbish = n.length === 3 && VERB_END.has(n[2]);
    if (verbish && strong !== 'rank' && VERB_STEMS.has(n.slice(0, 2)))
      return; // 지시한, 이동시 ...
    if (verbish && !strong && !usedAsName(text, n)) return;
    // 가장 먼저 나온 위치를 기억 (먼저 나온 사람이 갑)
    if (!found.has(n) || idx < found.get(n)) found.set(n, idx);
  };
  for (const [re, strong] of [
    [RE.label, true],
    [RE.nameAge, true],
    [RE.nameHon, false],
    [RE.rankName, 'rank'],
    [RE.namePos, 'pos'],
    [RE.titleName, false],
    [RE.nameTitle, false],
  ]) {
    re.lastIndex = 0;
    let m;
    // 한 글자씩 겹쳐 가며 찾음 ("소방위 진술자 홍길동"도 잡도록)
    while ((m = re.exec(text))) {
      add(m[1], m.index, strong);
      re.lastIndex = m.index + 1;
    }
  }
  for (const n of forced) {
    const i = text.indexOf(n);
    if (i >= 0 && !found.has(n)) found.set(n, i);
  }
  return found;
}

// ===== 5. 표 처리 =====
function cellType(txt) {
  const t = txt
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`]/g, '')
    .trim();
  if (!t || t.length > 20) return null;
  for (const [type, re] of CELL_LABELS) if (re.test(t)) return type;
  return null;
}
const plain = s =>
  s
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/[*_`]/g, '')
    .trim();

// 셀 값 하나를 종류에 맞게 처리. 이름은 수집만(나중에 전체 치환)
function maskCell(type, raw, ctx, names, exclude) {
  const val = plain(raw);
  if (!val || /^[-–—\s○*]+$/.test(val)) return raw;
  switch (type) {
    case 'name': {
      for (const tok of val.split(/[\s,·/()]+/)) {
        if (
          /^[가-힣]{2,4}$/.test(tok) &&
          validName(tok, exclude, true) &&
          !names.has(tok)
        )
          names.set(tok, Infinity);
      }
      return raw;
    }
    case 'addr': {
      if (val.length >= 4) {
        ctx.addrs.set(val, '[주소]');
        bump(ctx, '주소');
      }
      return mk(ctx, '[주소]');
    }
    case 'id':
    case 'phone':
    case 'acct':
      bump(
        ctx,
        type === 'id'
          ? '주민번호·생년월일 등'
          : type === 'phone'
            ? '전화번호'
            : '계좌번호',
      );
      return mkTrim(ctx, raw.replace(/\d/g, '*'));
    case 'email':
      bump(ctx, '이메일');
      return mk(ctx, '[이메일]');
    case 'biz': {
      if (ctx.noBiz) return raw;
      if (!ctx.biz.has(val))
        ctx.biz.set(val, `[업체${letter(ctx.biz.size)}]`);
      bump(ctx, '업체·상호');
      return mk(ctx, ctx.biz.get(val));
    }
    default:
      return raw; // org 는 본문 규칙으로 처리
  }
}

function processRows(rows, ctx, names, exclude) {
  // rows: string[][] (셀 원문). 반환: 수정된 rows
  const out = rows.map(r => r.slice());
  // (1) 라벨-값(양식형): 라벨 셀 바로 오른쪽 셀
  for (const r of out) {
    for (let j = 0; j < r.length - 1; j++) {
      const t = cellType(r[j]);
      if (
        t &&
        !cellType(r[j + 1]) &&
        !HEADER_WORDS.has(plain(r[j + 1]))
      )
        r[j + 1] = maskCell(t, r[j + 1], ctx, names, exclude);
    }
  }
  // (2) 머리글형: 첫 행이 라벨이고 그 아래가 값
  if (out.length > 1) {
    const head = rows[0].map(cellType);
    const kvLike = rows[0].some(
      (c, j) =>
        head[j] &&
        j + 1 < rows[0].length &&
        plain(rows[0][j + 1]) &&
        !head[j + 1],
    );
    if (head.some(Boolean) && !kvLike) {
      for (let i = 1; i < out.length; i++) {
        out[i] = out[i].map((c, j) =>
          head[j] && !cellType(c)
            ? maskCell(head[j], c, ctx, names, exclude)
            : c,
        );
      }
    }
  }
  return out;
}

function processMdTables(text, ctx, names, exclude) {
  const lines = text.split('\n');
  const isRow = l => /^\s*\|.*\|\s*$/.test(l);
  const isSep = l =>
    /^\s*\|?\s*:?-{2,}/.test(l) && /^[\s|:\-]+$/.test(l);
  for (let i = 0; i < lines.length; i++) {
    if (!isRow(lines[i])) continue;
    let j = i;
    const idx = [];
    while (j < lines.length && isRow(lines[j])) {
      if (!isSep(lines[j])) idx.push(j);
      j++;
    }
    const rows = idx.map(k =>
      lines[k].trim().replace(/^\|/, '').replace(/\|$/, '').split('|'),
    );
    const res = processRows(rows, ctx, names, exclude);
    idx.forEach((k, n) => {
      const lead = lines[k].match(/^\s*/)[0];
      lines[k] = lead + '|' + res[n].join('|') + '|';
    });
    i = j - 1;
  }
  return lines.join('\n');
}

function processHtmlTables(text, ctx, names, exclude) {
  return text.replace(/<table[\s\S]*?<\/table>/gi, table => {
    const trs = table.match(/<tr[\s\S]*?<\/tr>/gi) || [];
    const cellRe = /(<t[dh][^>]*>)([\s\S]*?)(<\/t[dh]>)/gi;
    const rows = trs.map(tr => [...tr.matchAll(cellRe)].map(m => m[2]));
    const res = processRows(rows, ctx, names, exclude);
    let r = 0;
    return table.replace(/<tr[\s\S]*?<\/tr>/gi, tr => {
      const vals = res[r++] || [];
      let c = 0;
      return tr.replace(
        cellRe,
        (all, a, inner, b) => a + (vals[c++] ?? inner) + b,
      );
    });
  });
}

// ===== 6. 본문 치환 =====
function maskText(text, ctx, opt) {
  const exclude = opt.exclude;
  // (1) 이름 수집은 원문에서 (나이·주민번호 괄호가 단서이므로 먼저)
  const names = collectNames(text, exclude, opt.forced);

  // (2) 표
  text = processMdTables(text, ctx, names, exclude);
  text = processHtmlTables(text, ctx, names, exclude);

  // (3) 정형 개인정보
  const sub = (re, label, fn) => {
    text = text.replace(re, (...a) => {
      bump(ctx, label);
      return fn(...a);
    });
  };
  const M = s => mk(ctx, s);
  sub(RE.rrn, '주민번호·생년월일 등', () => M('******-*******'));
  sub(RE.mobile, '전화번호', () => M('010-****-****'));
  sub(RE.landline, '전화번호', m => M(m.replace(/\d/g, '*')));
  sub(RE.email, '이메일', () => M('[이메일]'));
  sub(
    RE.birth,
    '주민번호·생년월일 등',
    (m, a, b) => a + M(b.replace(/\d/g, '*')),
  );
  sub(
    RE.acctCtx,
    '계좌번호',
    (m, a, b) => a + M(b.replace(/\d/g, '*')),
  );
  text = text.replace(RE.acctGeneric, m =>
    m.replace(/\D/g, '').length >= 10
      ? (bump(ctx, '계좌번호'), M(m.replace(/\d/g, '*')))
      : m,
  );
  sub(RE.car, '차량번호', () => M('**○ ****'));
  sub(RE.addrLine, '주소', (m, a) => a + M('[주소]'));
  for (const [s, r] of [...ctx.addrs].sort(
    (a, b) => b[0].length - a[0].length,
  )) {
    if (s.length >= 6) text = text.split(s).join(M(r));
  }
  sub(RE.aptUnit, '주소', () => M('○○동 ○○호'));
  sub(RE.road, '주소', m =>
    M(
      m
        .replace(/^[가-힣A-Za-z0-9]+?(대로|로|길)/, '○○$1')
        .replace(/\d+/g, '○'),
    ),
  );
  sub(RE.jibun, '주소', () => M('○○동 ○번지'));
  if (!opt.keepAge)
    sub(RE.age, '나이', (m, man) => (man || '') + M('○○세'));

  // (4) 업체명(표에서 수집된 것) 전체 치환
  for (const [s, r] of [...ctx.biz].sort(
    (a, b) => b[0].length - a[0].length,
  )) {
    if (s.length >= 2) [text] = replaceWithParticle(text, s, r, ctx);
  }

  // (5) 기관(소방서·센터·구조대 등)
  text = text.replace(RE.org, (m, pre, suf) => {
    if (
      ORG_PREFIX_EXCLUDE.has(pre) ||
      exclude.has(m) ||
      exclude.has(pre)
    )
      return m;
    const key = pre + suf;
    if (!ctx.orgs.has(key)) {
      const kind = suf.replace(/^119/, '');
      ctx.orgCount[kind] = (ctx.orgCount[kind] || 0) + 1;
      const tag =
        ctx.style === 'abc'
          ? '가나다라마바사아자차카타파하'[ctx.orgCount[kind] - 1] ||
            letter(ctx.orgCount[kind] - 1)
          : letter(ctx.orgCount[kind] - 1);
      ctx.orgs.set(key, tag + suf);
    }
    bump(ctx, '소속기관');
    return M(ctx.orgs.get(key));
  });

  // (6) 인물: 등장 순서대로 가명 부여 후 전체 치환
  const ordered = [...names.entries()]
    .sort((a, b) => a[1] - b[1])
    .map(e => e[0]);
  ordered.forEach(n => personCode(ctx, n));
  // exclude.txt 에 적은 낱말은 대조표에 있어도 가리지 않음
  for (const n of exclude) ctx.persons.delete(n);
  const all = [...ctx.persons.keys()]
    .filter(n => text.includes(n))
    .sort((a, b) => b.length - a.length);
  for (const n of all) {
    const [t2, cnt] = replaceWithParticle(
      text,
      n,
      ctx.persons.get(n),
      ctx,
    );
    if (cnt) {
      bump(ctx, '인물(성명)', cnt);
      text = t2;
    }
  }
  // "홍 팀장"처럼 성만 쓴 경우
  // (그 성을 가진 사람이 1명뿐일 때만)
  if (ctx.style !== 'partial') {
    const bySur = {};
    for (const n of ctx.persons.keys()) {
      const s = SURNAMES_2.find(x => n.startsWith(x)) || n[0];
      (bySur[s] = bySur[s] || []).push(n);
    }
    for (const [s, list] of Object.entries(bySur)) {
      if (list.length !== 1) continue;
      const re = rx(
        'g',
        String.raw`(?<![${H}])`,
        esc(s),
        String.raw`(\s?)(?=(?:지방)?(?:${TITLES})`,
        String.raw`(?![${H}]{2}))`,
      );
      text = text.replace(re, (m, sp) => {
        bump(ctx, '인물(성+직급)');
        return M(ctx.persons.get(list[0])) + sp;
      });
    }
  }
  return text;
}

// 남은 의심 숫자열(9자리 이상) 찾기
function residualWarnings(text) {
  const out = [];
  text.split('\n').forEach((l, i) => {
    const m = l.match(/\d[\d\s-]{8,}\d/g);
    if (
      m &&
      m.some(
        x =>
          x.replace(/\D/g, '').length >= 9 &&
          !/^\d{4}[-.]\d{1,2}[-.]\d{1,2}/.test(x),
      )
    )
      out.push(i + 1);
  });
  return out;
}

// ===== 7. 파일 입출력 =====
// 파일 맨 앞의 보이지 않는 표시(BOM)
const BOM = String.fromCharCode(0xfeff);
const stripBom = s => (s.startsWith(BOM) ? s.slice(1) : s);
const CONVERT_EXT = new Set(
  W('.hwp .hwpx .pdf .docx .xlsx .xls .hwpml '),
);
const TEXT_EXT = new Set(['.md', '.txt', '.markdown']);

function readList(file) {
  try {
    return stripBom(fs.readFileSync(file, 'utf8'))
      .split(/\r?\n/)
      .map(s => s.trim())
      .filter(s => s && !s.startsWith('#'));
  } catch {
    return [];
  }
}

function toMarkdown(file, kordocCmd) {
  const ext = path.extname(file).toLowerCase();
  if (TEXT_EXT.has(ext)) return stripBom(fs.readFileSync(file, 'utf8'));
  // kordoc 변환 결과(가명처리 전 원본)는 임시폴더에 잠깐 두고 즉시 삭제
  const tmp = path.join(
    os.tmpdir(),
    `mask_${process.pid}_${Date.now()}.md`,
  );
  try {
    const r = spawnSync(`${kordocCmd} "${file}" -o "${tmp}"`, {
      shell: true,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (!fs.existsSync(tmp))
      throw new Error(
        (r.stderr || r.stdout || 'kordoc 변환 실패')
          .trim()
          .split('\n')
          .slice(-3)
          .join(' / '),
      );
    return fs.readFileSync(tmp, 'utf8');
  } finally {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* 없음 */
    }
  }
}

function csvCell(s) {
  return `"${String(s).replace(/"/g, '""')}"`;
}
function writeMapping(file, ctx) {
  const rows = [['구분', '원문', '가명']];
  for (const [k, v] of ctx.persons) rows.push(['인물', k, v]);
  for (const [k, v] of ctx.orgs) rows.push(['소속기관', k, v]);
  for (const [k, v] of ctx.biz) rows.push(['업체·상호', k, v]);
  for (const [k] of ctx.addrs) rows.push(['주소', k, '[주소]']);
  fs.writeFileSync(
    file,
    BOM + rows.map(r => r.map(csvCell).join(',')).join('\r\n'),
    'utf8',
  );
}

// CSV 한 줄씩 읽기 (따옴표 안의 쉼표·줄바꿈 처리)
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// 사건 대조표(case_mapping.csv)를 읽어 이어서 쓸 준비
const CASE_FILE = 'case_mapping.csv';
function loadCase(file, style) {
  const ctx = newContext(style);
  if (!fs.existsSync(file)) return ctx;
  const text = stripBom(fs.readFileSync(file, 'utf8'));
  if (text.includes('\ufffd'))
    throw new Error(
      `${CASE_FILE} 의 글자 형식이 바뀌었습니다. 엑셀에서 저장했다면 ` +
        '"CSV UTF-8" 형식으로 다시 저장하세요.',
    );
  const suffixes = [...ORG_SUFFIX].sort((a, b) => b.length - a.length);
  for (const [kind, k, v] of parseCsv(text).slice(1)) {
    if (!k || !v) continue;
    if (kind === '인물') ctx.persons.set(k, v);
    else if (kind === '업체·상호') ctx.biz.set(k, v);
    else if (kind === '주소') ctx.addrs.set(k, '[주소]');
    else if (kind === '소속기관') {
      ctx.orgs.set(k, v);
      const suf = suffixes.find(x => k.endsWith(x));
      if (suf) {
        const t = suf.replace(/^119/, '');
        ctx.orgCount[t] = (ctx.orgCount[t] || 0) + 1;
      }
    }
  }
  ctx.loaded = ctx.persons.size + ctx.orgs.size + ctx.biz.size;
  return ctx;
}

function gather(inputs) {
  const files = [];
  for (const p of inputs) {
    if (!fs.existsSync(p)) {
      console.log(`  [건너뜀] 없는 경로: ${p}`);
      continue;
    }
    if (fs.statSync(p).isDirectory()) {
      for (const f of fs.readdirSync(p)) {
        const full = path.join(p, f),
          ext = path.extname(f).toLowerCase();
        if (
          fs.statSync(full).isFile() &&
          (TEXT_EXT.has(ext) || CONVERT_EXT.has(ext)) &&
          !/_masked\.(md|pdf|html)$/i.test(f)
        )
          files.push(full);
      }
    } else files.push(p);
  }
  return files;
}

function parseArgs(argv) {
  const o = {
    inputs: [],
    style: 'gap',
    shared: false,
    map: true,
    keepAge: false,
    keepBiz: false,
    out: null,
    kordoc: null,
    pdf: true,
    ai: true,
    browser: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--out') o.out = argv[++i];
    else if (a === '--style') o.style = argv[++i];
    else if (a === '--shared') o.shared = true;
    else if (a === '--no-map') o.map = false;
    else if (a === '--keep-age') o.keepAge = true;
    else if (a === '--keep-biz') o.keepBiz = true;
    else if (a === '--kordoc') o.kordoc = argv[++i];
    else if (a === '--no-pdf') o.pdf = false;
    else if (a === '--no-ai') o.ai = false;
    else if (a === '--browser') o.browser = argv[++i];
    else if (a === '--test') o.test = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else o.inputs.push(a);
  }
  return o;
}

// ===== 8. AI 이름 찾기 (선택) =====
// ai_names.js 와 models 폴더가 있으면 문맥으로 이름을 더 찾음
function loadAiModule(here) {
  for (const f of ['ai_names.js', 'ai_names.js.txt']) {
    const p = path.join(here, f);
    if (fs.existsSync(p)) return require(p);
  }
  return null;
}

// AI가 고른 말에서 조사를 떼고, 이름 모양인지 다시 확인
const NAME_TAILS = alt([
  ...PARTICLES,
  ...W('입니다 입니까 이었다 이었고 이었으며 였다 였고 이고 이며'),
  ...W('이라고 이라는 라고 라는 이랑 랑 부터 까지 처럼 하고 보다'),
  ...W('께서 께 에서 등 외 및 로부터 으로부터'),
]);
const NAME_SHAPE = new RegExp(
  `^(?:(?:${SURNAMES_2.join('|')})[${H}]{1,2}` +
    `|[${SURNAMES_1}][${H}]{1,2})$`,
);
function aiNames(found, exclude) {
  const tail = new RegExp(`(?:${NAME_TAILS})$`);
  const out = new Set();
  for (const { text, score } of found) {
    let n = text.replace(/[^가-힣]/g, '');
    const max = SURNAMES_2.some(x => n.startsWith(x)) ? 4 : 3;
    while (n.length > max && tail.test(n)) n = n.replace(tail, '');
    if (!NAME_SHAPE.test(n)) continue;
    // 두 글자는 다른 낱말 속에도 흔해 AI만 믿고 가리지 않음
    if (n.length < 3 || score < 0.6) continue;
    if (!validName(n, exclude, 'rank')) continue;
    const verbish = n.length === 3 && VERB_END.has(n[2]);
    if (verbish && VERB_STEMS.has(n.slice(0, 2))) continue;
    out.add(n);
  }
  return [...out];
}

// ===== 9. PDF 만들기 =====
// md -> HTML (표·제목·목록 등). 가린 자리는 노란색으로 칠함
const escHtml = s =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const marks = s =>
  s.split(MK_OPEN).join('<mark>').split(MK_CLOSE).join('</mark>');

function inline(s) {
  let t = escHtml(s).replace(/&lt;br\s*\/?&gt;/gi, '<br>');
  t = t
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1'); // 링크는 글자만
  return marks(t);
}

// 문서 안 HTML 표: 표에 필요한 태그만 남기고 나머지는 지움
const KEEP_TAGS = new Set(
  W('table thead tbody tr td th br b strong i em p span sup sub'),
);
function cleanHtml(block) {
  const t = block
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?([a-zA-Z0-9]+)([^>]*)>/g, (m, tag, attrs) => {
      tag = tag.toLowerCase();
      if (!KEEP_TAGS.has(tag)) return '';
      if (m.startsWith('</')) return `</${tag}>`;
      const span = [...attrs.matchAll(/(colspan|rowspan)="?(\d+)"?/gi)]
        .map(x => ` ${x[1].toLowerCase()}="${x[2]}"`)
        .join('');
      return `<${tag}${span}>`;
    });
  return marks(t);
}

function mdToHtml(src) {
  const L = src.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  const isRow = l => /^\s*\|.*\|\s*$/.test(l);
  const isSep = l => /^[\s|:\-]+$/.test(l) && /-{2,}/.test(l);
  const cells = l =>
    l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|');
  const isList = l => /^\s*([-*+]|\d+[.)])\s+/.test(l);
  const isBlock = l =>
    /^\s*$/.test(l) ||
    /^(#{1,6}\s|```|\s*>|\s*<table)/i.test(l) ||
    isRow(l) ||
    isList(l);
  let i = 0;
  while (i < L.length) {
    const l = L[i];
    if (/^\s*$/.test(l)) {
      i++;
    } else if (/^```/.test(l)) {
      const b = [];
      for (i++; i < L.length && !/^```/.test(L[i]); i++) b.push(L[i]);
      i++;
      out.push(`<pre>${marks(escHtml(b.join('\n')))}</pre>`);
    } else if (/^\s*<table/i.test(l)) {
      const b = [];
      while (i < L.length) {
        b.push(L[i]);
        if (/<\/table>/i.test(L[i++])) break;
      }
      out.push(cleanHtml(b.join('\n')));
    } else if (/^#{1,6}\s/.test(l)) {
      const n = l.match(/^#+/)[0].length;
      out.push(`<h${n}>${inline(l.replace(/^#+\s*/, ''))}</h${n}>`);
      i++;
    } else if (/^\s*([-*_])(\s*\1){2,}\s*$/.test(l)) {
      out.push('<hr>');
      i++;
    } else if (isRow(l)) {
      const rows = [];
      let head = null;
      while (i < L.length && isRow(L[i])) {
        if (isSep(L[i])) head = head || rows.length;
        else rows.push(cells(L[i]));
        i++;
      }
      const tr = (r, tag) =>
        '<tr>' +
        r.map(c => `<${tag}>${inline(c.trim())}</${tag}>`).join('') +
        '</tr>';
      out.push(
        '<table>' +
          rows
            .map((r, k) => tr(r, head && k < head ? 'th' : 'td'))
            .join('') +
          '</table>',
      );
    } else if (/^\s*>/.test(l)) {
      const b = [];
      while (i < L.length && /^\s*>/.test(L[i]))
        b.push(inline(L[i++].replace(/^\s*>\s?/, '')));
      out.push(`<blockquote>${b.join('<br>')}</blockquote>`);
    } else if (isList(l)) {
      const ordered = /^\s*\d/.test(l);
      const b = [];
      while (i < L.length && isList(L[i])) {
        const depth = Math.floor(L[i].match(/^\s*/)[0].length / 2);
        const t = L[i++].replace(/^\s*([-*+]|\d+[.)])\s+/, '');
        b.push(`<li style="margin-left:${depth}em">${inline(t)}</li>`);
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${b.join('')}</${tag}>`);
    } else {
      const b = [];
      while (i < L.length && !isBlock(L[i])) b.push(inline(L[i++]));
      out.push(`<p>${b.join('<br>')}</p>`);
    }
  }
  return out.join('\n');
}

function htmlPage(body, title, info) {
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8">
<title>${escHtml(title)}</title><style>
@page{size:A4;margin:18mm 16mm 20mm;
@bottom-center{content:counter(page) " / " counter(pages);
font-size:9pt;color:#666}}
body{font-family:'Malgun Gothic','맑은 고딕','Noto Sans KR',
'Noto Sans CJK KR',sans-serif;font-size:10.5pt;line-height:1.7;
color:#111;word-break:keep-all;overflow-wrap:anywhere}
.top{border-bottom:2px solid #333;padding-bottom:6px;margin-bottom:14px}
.top h1{font-size:15pt;margin:0 0 4px}
.top div{font-size:9pt;color:#444}
h1,h2,h3,h4{line-height:1.4;margin:1.2em 0 .5em}
table{border-collapse:collapse;width:100%;margin:.6em 0;font-size:9.5pt}
th,td{border:1px solid #999;padding:4px 6px;vertical-align:top}
th{background:#eee}
mark{background:#ffe066;padding:0 2px;border-radius:2px}
pre{white-space:pre-wrap;background:#f5f5f5;padding:8px;font-size:9pt}
blockquote{border-left:3px solid #bbb;margin:.6em 0;padding-left:10px}
ul,ol{padding-left:1.4em}
</style></head><body>
<div class="top"><h1>${escHtml(title)}</h1><div>${escHtml(info)}</div>
<div><mark>노란색</mark> 부분이 가려진(가명처리된) 곳입니다.</div></div>
${body}
</body></html>`;
}

// PDF를 만들 브라우저 찾기 (Windows 기본 Edge -> Chrome 순)
function findBrowser(given) {
  const env = process.env;
  const list = [
    given,
    env.MASKER_BROWSER,
    path.join(
      env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)',
      'Microsoft\\Edge\\Application\\msedge.exe',
    ),
    path.join(
      env.ProgramFiles || 'C:\\Program Files',
      'Microsoft\\Edge\\Application\\msedge.exe',
    ),
    path.join(
      env.ProgramFiles || 'C:\\Program Files',
      'Google\\Chrome\\Application\\chrome.exe',
    ),
    env.LOCALAPPDATA &&
      path.join(
        env.LOCALAPPDATA,
        'Google\\Chrome\\Application\\chrome.exe',
      ),
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/microsoft-edge',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
  ];
  return list.find(p => p && fs.existsSync(p)) || null;
}

// 브라우저를 화면 없이 잠깐 띄워 HTML을 PDF로 인쇄
function printPdf(browser, htmlFile, pdfFile) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'mask_pdf_'));
  try {
    try {
      fs.unlinkSync(pdfFile);
    } catch {
      /* 없음 */
    }
    spawnSync(
      browser,
      [
        '--headless',
        '--disable-gpu',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-sync',
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-domain-reliability',
        '--disable-features=Translate,MediaRouter,OptimizationHints',
        '--no-service-autorun',
        ...(process.getuid && process.getuid() === 0
          ? ['--no-sandbox']
          : []),
        `--user-data-dir=${profile}`,
        '--no-pdf-header-footer',
        '--print-to-pdf-no-header',
        `--print-to-pdf=${pdfFile}`,
        url.pathToFileURL(htmlFile).href,
      ],
      { stdio: 'ignore', timeout: 60000 },
    );
    return fs.existsSync(pdfFile) && fs.statSync(pdfFile).size > 0;
  } finally {
    try {
      fs.rmSync(profile, { recursive: true, force: true });
    } catch {
      /* 없음 */
    }
  }
}

// 결과 파일 제목에도 실명이 보이지 않게 대조표로 바꿈
function maskTitle(title, ctx) {
  let t = title;
  const names = [...ctx.persons.keys()].sort(
    (a, b) => b.length - a.length,
  );
  for (const n of names) t = t.split(n).join(ctx.persons.get(n));
  return t;
}

// ===== 10. 자체 점검 (--test) =====
const TEST_IN = [
  '| 성명 | 홍길동 | 연락처 | 010-1234-5678 |',
  '|---|---|---|---|',
  '| 주소 | 서울시 중구 세종대로 110 | 생년월일 | 1974. 3. 5. |',
  '신고인 김영희 씨는 동부구청 주무관 홍길동(52세)을',
  '신고하였다. 홍 주무관은 차량 12가 3456을 이용하였다.',
  '주민등록번호 740305-1234567, 메일 abc@test.com',
  '소방장 김민한입니다. 차량 이동시 팀장 윤태한 반장에게 보고.',
].join('\n');
const TEST_OUT = [
  '| 성명 | 을 | 연락처 | ***-****-**** |',
  '|---|---|---|---|',
  '| 주소 |[주소]| 생년월일 | ****. *. *. |',
  '신고인 갑 씨는 A구청 주무관 을(○○세)을',
  '신고하였다. 을 주무관은 차량 **○ ****을 이용하였다.',
  '주민등록번호 ******-*******, 메일 [이메일]',
  '소방장 병입니다. 차량 이동시 팀장 정 반장에게 보고.',
].join('\n');
function selfTest() {
  const ctx = newContext('gap');
  const opt = { exclude: new Set(), forced: [], keepAge: false };
  const got = maskText(TEST_IN, ctx, opt);
  if (got === TEST_OUT) {
    console.log('[정상] 프로그램이 올바르게 작동합니다.');
    return;
  }
  const a = got.split('\n');
  const b = TEST_OUT.split('\n');
  console.log('[오류] 코드가 잘못 복사된 것 같습니다.');
  a.forEach((l, i) => {
    if (l !== b[i]) console.log(`  ${i + 1}줄 결과: ${l}`);
  });
  process.exitCode = 1;
}

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.test) return selfTest();
  if (o.help || !o.inputs.length) {
    console.log(
      stripBom(fs.readFileSync(__filename, 'utf8'))
        .split('*/')[0]
        .replace(/^\/\*/, '')
        .replace(/^ \* ?/gm, ''),
    );
    return;
  }
  const here = __dirname;
  const exclude = new Set(readList(path.join(here, 'exclude.txt')));
  const forced = readList(path.join(here, 'names.txt'));
  const files = gather(o.inputs);
  if (!o.kordoc) {
    const t = spawnSync('kordoc --version', {
      shell: true,
      encoding: 'utf8',
    });
    o.kordoc = t.status === 0 ? 'kordoc' : 'npx kordoc';
  }
  if (!files.length) {
    console.log('처리할 파일이 없습니다.');
    return;
  }
  const browser = o.pdf ? findBrowser(o.browser) : null;
  const keepCase = o.shared && o.map; // 사건 대조표 이어쓰기

  const mode = o.shared ? ', 사건 공통 가명' : '';
  console.log(
    `\n개인정보 가명처리 시작 - ${files.length}개 파일` +
      ` (인물 표기: ${o.style}${mode})\n`,
  );
  if (o.shared && !o.map)
    console.log(
      '  [안내] --no-map 이라 사건 대조표를 저장하지 않습니다.\n',
    );
  // AI 이름 찾기: 준비돼 있으면 자동 사용 (--no-ai 로 끔)
  let ner = null;
  const aiMod = o.ai ? loadAiModule(here) : null;
  if (aiMod && fs.existsSync(path.join(here, 'models'))) {
    try {
      const r = await aiMod.load(here);
      if (r.ner) {
        ner = r.ner;
        console.log('  [AI] 문맥으로 이름 찾기를 함께 씁니다.\n');
      } else console.log(`  [AI] 사용 안 함 - ${r.error}\n`);
    } catch (e) {
      console.log(`  [AI] 사용 안 함 - ${e.message}\n`);
    }
  }
  const cases = new Map(); // 결과 폴더별 사건 대조표
  let ok = 0;
  let htmlOnly = 0;
  for (const f of files) {
    const name = path.basename(f, path.extname(f));
    const outDir = o.out || path.join(path.dirname(f), 'masked');
    const caseFile = path.join(outDir, CASE_FILE);
    try {
      let ctx;
      if (keepCase) {
        if (!cases.has(outDir)) {
          const c = loadCase(caseFile, o.style);
          if (c.loaded)
            console.log(
              `  [대조표] 이전 기록 ${c.persons.size}명 이어쓰기`,
            );
          cases.set(outDir, c);
        }
        ctx = cases.get(outDir);
      } else if (o.shared) {
        ctx = cases.get('') || newContext(o.style);
        cases.set('', ctx);
      } else ctx = newContext(o.style);
      ctx.noBiz = o.keepBiz;
      ctx.mark = true;
      ctx.counts = {};
      const md = toMarkdown(f, o.kordoc);
      let names = forced;
      let aiList = [];
      if (ner) {
        aiList = aiNames(await aiMod.findNames(ner, md), exclude);
        names = [...new Set([...forced, ...aiList])];
      }
      const marked = maskText(md, ctx, {
        exclude,
        forced: names,
        keepAge: o.keepAge,
      });
      const masked = unmark(marked);
      fs.mkdirSync(outDir, { recursive: true });
      const outFile = path.join(outDir, `${name}_masked.md`);
      fs.writeFileSync(outFile, masked, 'utf8');
      if (keepCase) writeMapping(caseFile, ctx);
      else if (o.map)
        writeMapping(path.join(outDir, `${name}_mapping.csv`), ctx);
      ok++;
      const c =
        Object.entries(ctx.counts)
          .map(([k, v]) => `${k} ${v}`)
          .join(', ') || '탐지 없음';
      console.log(`  [완료] ${path.basename(f)}`);
      console.log(`     -> ${outFile}`);
      if (o.pdf) {
        const title = maskTitle(name, ctx);
        const info =
          `원본: ${maskTitle(path.basename(f), ctx)} · ` +
          `처리일: ${new Date().toLocaleDateString('ko-KR')}`;
        const page = htmlPage(mdToHtml(marked), title, info);
        const pdfFile = path.join(outDir, `${name}_masked.pdf`);
        const tmpHtml = path.join(
          os.tmpdir(),
          `mask_${process.pid}_${Date.now()}.html`,
        );
        fs.writeFileSync(tmpHtml, page, 'utf8');
        let done = false;
        try {
          done = browser && printPdf(browser, tmpHtml, pdfFile);
        } finally {
          if (done) fs.unlinkSync(tmpHtml);
        }
        if (done) console.log(`     -> ${pdfFile}`);
        else {
          const htmlFile = path.join(outDir, `${name}_masked.html`);
          fs.renameSync(tmpHtml, htmlFile);
          htmlOnly++;
          console.log(`     -> ${htmlFile} (PDF 대신 HTML)`);
        }
      }
      console.log(`     치환: ${c}`);
      if (ner && aiList.length)
        console.log(`     AI가 찾은 이름: ${aiList.length}개`);
      const bz = ctx.biz.size ? `, 업체 ${ctx.biz.size}곳` : '';
      console.log(
        `     인물 ${ctx.persons.size}명, ` +
          `기관 ${ctx.orgs.size}곳${bz}`,
      );
      const warn = residualWarnings(masked);
      if (warn.length) {
        const more = warn.length > 10 ? ' 외' : '';
        const rows = warn.slice(0, 10).join(', ');
        console.log(`     [확인] 남은 긴 숫자열: ${rows}행${more}`);
      }
    } catch (e) {
      const busy = /EBUSY|EPERM/.test(String(e.code));
      const why = busy
        ? '결과 파일이 엑셀 등에 열려 있습니다. 닫고 다시 하세요.'
        : e.message;
      console.log(`  [실패] ${path.basename(f)} - ${why}`);
    }
  }
  console.log(`\n완료: ${ok}/${files.length}개.`);
  if (htmlOnly) {
    console.log(
      '* PDF를 만들 브라우저(Edge·Chrome)를 찾지 못해 HTML로',
    );
    console.log(
      '  저장했습니다. HTML을 열고 Ctrl+P -> PDF로 저장하세요.',
    );
  }
  if (keepCase) {
    console.log(
      `* ${CASE_FILE} 에 사건 대조표가 누적됩니다(실명 포함).`,
    );
    console.log(
      '  같은 사건 문서는 같은 폴더에 두고 이어서 처리하세요.',
    );
  } else if (o.map) {
    console.log('* _mapping.csv 에는 실명이 들어 있습니다.');
  }
  if (o.map)
    console.log('  결과 md·pdf와 따로 보관하고 외부로 보내지 마세요.');
  console.log('* 결과 파일을 꼭 한 번 훑어보세요.');
  console.log('  놓친 이름은 names.txt, 잘못 가려진 낱말은');
  console.log('  exclude.txt에 적으면 다음부터 반영됩니다.\n');
}

if (require.main === module)
  main().catch(e => {
    console.log(`[오류] ${e.message}`);
    process.exitCode = 1;
  });
module.exports = { maskText, newContext, collectNames, aiNames };
