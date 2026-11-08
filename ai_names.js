/*
 * AI 이름 찾기 (선택 기능) - masker.js 가 불러 씀
 *
 * 문장의 앞뒤 흐름을 보고 사람 이름을 찾는 작은 AI 모델
 * (koelectra-ko-pii-ner, Apache-2.0)을 이 컴퓨터에서만 돌립니다.
 * 인터넷 연결 없이 작동하며, 문서 내용은 밖으로 나가지 않습니다.
 *
 * 필요한 것 (없으면 AI 없이 기존 방식으로만 처리)
 *   1) 이 폴더에서 한 번:  npm install @huggingface/transformers
 *   2) models\koelectra-ko-pii-ner 폴더 (get_model.js 로 받기)
 */
'use strict';
const fs = require('fs');
const path = require('path');

const MODEL = 'koelectra-ko-pii-ner';
const ONNX = path.join('onnx', 'model_quantized.onnx');
const NEED = ['config.json', 'tokenizer.json', 'tokenizer_config.json'];

function modelDir(base) {
  return path.join(base, 'models', MODEL);
}
function hasModel(base) {
  const d = modelDir(base);
  return [...NEED, ONNX].every(f => fs.existsSync(path.join(d, f)));
}

// 모델 불러오기. 준비가 안 됐으면 { error } 를 돌려줌
async function load(base) {
  if (!hasModel(base))
    return {
      error: 'models 폴더에 AI 모델이 없습니다 (get_model.js).',
    };
  let tf;
  try {
    tf = await import('@huggingface/transformers');
  } catch {
    return {
      error:
        'AI 부품이 없습니다. 이 폴더에서 한 번 실행하세요: ' +
        'npm install @huggingface/transformers',
    };
  }
  tf.env.allowRemoteModels = false; // 인터넷에서 받지 않음
  tf.env.allowLocalModels = true;
  tf.env.localModelPath = path.join(base, 'models') + path.sep;
  const ner = await tf.pipeline('token-classification', MODEL, {
    dtype: 'q8',
  });
  return { ner };
}

// 긴 문서를 모델이 한 번에 읽을 만큼씩 나눔 (줄 단위)
function chunks(text, max = 300) {
  const out = [];
  let cur = '';
  for (const raw of text.split('\n')) {
    const line = raw.replace(/[|*#>`]/g, ' ').trim();
    if (!line) continue;
    for (let i = 0; i < line.length; i += max) {
      const part = line.slice(i, i + max);
      if (cur && cur.length + part.length + 1 > max) {
        out.push(cur);
        cur = '';
      }
      cur = cur ? cur + '\n' + part : part;
    }
  }
  if (cur) out.push(cur);
  return out;
}

// 낱말 조각(B-NAME, I-NAME ...)을 이어 붙여 이름 덩어리로
function joinNames(tokens) {
  const names = [];
  let cur = null;
  let last = -2;
  for (const t of tokens) {
    const label = String(t.entity || t.entity_group || '');
    const word = String(t.word || '');
    const isName = /NAME$/.test(label);
    const piece = word.replace(/^##/, '');
    const next = t.index === last + 1;
    if (isName && /^I-/.test(label) && cur && next) {
      cur.text += (word.startsWith('##') ? '' : ' ') + piece;
      cur.scores.push(t.score);
    } else if (isName) {
      if (cur) names.push(cur);
      cur = { text: piece, scores: [t.score] };
    } else if (cur) {
      names.push(cur);
      cur = null;
    }
    last = t.index;
  }
  if (cur) names.push(cur);
  return names.map(n => ({
    text: n.text.replace(/\s+/g, ''),
    score: Math.min(...n.scores),
  }));
}

// 문서에서 AI가 사람 이름이라고 본 말 목록 (점수 포함)
async function findNames(ner, text) {
  const found = [];
  for (const c of chunks(text)) {
    const tokens = await ner(c);
    found.push(...joinNames(tokens));
  }
  return found;
}

module.exports = { MODEL, ONNX, NEED, modelDir, hasModel, load };
module.exports.findNames = findNames;
module.exports.joinNames = joinNames;
module.exports.chunks = chunks;
