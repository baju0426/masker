/*
 * AI 모델 내려받기 (한 번만) - node get_model.js
 *
 * 받는 곳: Hugging Face  atonlee/koelectra-ko-pii-ner (Apache-2.0)
 * 저장 위치: 이 폴더\models\koelectra-ko-pii-ner
 * 받는 동안에만 인터넷을 씁니다. 문서는 보내지 않습니다.
 *
 * 회사 인터넷에서 막히면: 집 PC에서 아래 4개 파일을 브라우저로
 * 받아 같은 폴더 구조로 USB 등에 담아 옮기세요.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const https = require('https');

const REPO = 'https://huggingface.co/atonlee/koelectra-ko-pii-ner';
const FILES = [
  'config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/model_quantized.onnx',
];
const DEST = path.join(__dirname, 'models', 'koelectra-ko-pii-ner');

function get(url, file, hops = 0) {
  return new Promise((ok, fail) => {
    https
      .get(url, res => {
        const loc = res.headers.location;
        if (res.statusCode >= 300 && res.statusCode < 400 && loc) {
          res.resume();
          if (hops > 5) return fail(new Error('주소 이동이 너무 많음'));
          const next = new URL(loc, url).href;
          return get(next, file, hops + 1).then(ok, fail);
        }
        if (res.statusCode !== 200) {
          res.resume();
          return fail(new Error(`받기 실패 (${res.statusCode})`));
        }
        const tmp = file + '.part';
        const out = fs.createWriteStream(tmp);
        res.pipe(out);
        out.on('finish', () => {
          out.close(() => {
            fs.renameSync(tmp, file);
            ok();
          });
        });
        out.on('error', fail);
      })
      .on('error', fail);
  });
}

async function main() {
  console.log('AI 모델 내려받기 시작\n');
  for (const f of FILES) {
    const file = path.join(DEST, ...f.split('/'));
    fs.mkdirSync(path.dirname(file), { recursive: true });
    if (fs.existsSync(file) && fs.statSync(file).size > 0) {
      console.log(`  [있음] ${f}`);
      continue;
    }
    const url = `${REPO}/resolve/main/${f}`;
    process.stdout.write(`  [받는 중] ${f} ... `);
    await get(url, file);
    const mb = (fs.statSync(file).size / 1048576).toFixed(1);
    console.log(`${mb} MB`);
  }
  console.log(`\n완료. 저장 위치: ${DEST}`);
}

main().catch(e => {
  console.log(`\n[실패] ${e.message}`);
  console.log('회사망에서 막혔다면 집 PC에서 받아 옮기세요.');
  console.log('브라우저로 받을 주소:');
  for (const f of FILES) console.log(`  ${REPO}/resolve/main/${f}`);
  console.log(`넣을 곳: ${DEST}`);
  process.exitCode = 1;
});
