// 24点求解器 — 深度规范化去重
const TARGET = 24;
const EPS = 1e-9;
function eq(a, b) { return Math.abs(a - b) < EPS; }

function num(v) { return { type: 'num', val: v, str: String(v) }; }
function mkOp(op, l, r) {
  const val = op === '+' ? l.val + r.val : op === '-' ? l.val - r.val
    : op === '*' ? l.val * r.val : l.val / r.val;
  return { type: 'op', op, left: l, right: r, val };
}

function solve(nodes) {
  const n = nodes.length;
  if (n === 1) return eq(nodes[0].val, TARGET) ? [nodes[0]] : [];
  const results = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const a = nodes[i], b = nodes[j];
      const rest = [];
      for (let k = 0; k < n; k++) if (k !== i && k !== j) rest.push(nodes[k]);
      results.push(...solve([...rest, mkOp('+', a, b)]));
      results.push(...solve([...rest, mkOp('-', a, b)]));
      results.push(...solve([...rest, mkOp('*', a, b)]));
      if (!eq(b.val, 0)) results.push(...solve([...rest, mkOp('/', a, b)]));
    }
  }
  return results;
}

// === 深度规范化 ===
// 1. 消除恒等运算：×1, ÷1, +0, -0
// 2. a-(b±c) → a∓b∓c, a/(b×c) → a/b/c, a/(b/c) → a×c/b
// 3. 结合律展平：(a+b)+c → [a,b,c], (a×b)×c → [a,b,c]
// 4. 交换律排序：对 + 和 * 的子项排序
// 5. 减法统一：a-b → a+(-b)，排序后再还原

function isNum(node, v) { return node.type === 'num' && eq(node.val, v); }

function normalize(node) {
  if (node.type === 'num') return node;

  let l = normalize(node.left);
  let r = normalize(node.right);
  const op = node.op;

  // 消除恒等运算
  if (op === '+' && isNum(r, 0)) return l;
  if (op === '+' && isNum(l, 0)) return r;
  if (op === '-' && isNum(r, 0)) return l;
  if (op === '*' && isNum(r, 1)) return l;
  if (op === '*' && isNum(l, 1)) return r;
  if (op === '/' && isNum(r, 1)) return l;

  // 将 a-(b+c) → a-b-c, a-(b-c) → a+c-b, a/(b*c) → a/b/c, a/(b/c) → a*c/b
  if (op === '-' && r.type === 'op' && r.op === '+') {
    return normalize(mkOp('-', mkOp('-', l, r.left), r.right));
  }
  if (op === '-' && r.type === 'op' && r.op === '-') {
    return normalize(mkOp('-', mkOp('+', l, r.right), r.left));
  }
  if (op === '/' && r.type === 'op' && r.op === '*') {
    return normalize(mkOp('/', mkOp('/', l, r.left), r.right));
  }
  if (op === '/' && r.type === 'op' && r.op === '/') {
    return normalize(mkOp('/', mkOp('*', l, r.right), r.left));
  }

  // 统一收集加减法项：把 a+b, a-b 中的项都拆成 {node, sign}
  // 不递归 normalize 子节点，由外层统一处理
  function collectAddRaw(node, sign, terms) {
    if (node.type === 'op' && node.op === '+') {
      collectAddRaw(node.left, sign, terms);
      collectAddRaw(node.right, sign, terms);
    } else if (node.type === 'op' && node.op === '-') {
      collectAddRaw(node.left, sign, terms);
      collectAddRaw(node.right, -sign, terms);
    } else {
      terms.push({ node: normalize(node), sign });
    }
  }

  function buildSumDiff(pos, neg) {
    // pos, neg 已排序且已过滤 0
    if (pos.length === 0 && neg.length === 0) return num(0);
    let posSum = pos.length > 0 ? pos[0] : null;
    for (let i = 1; i < pos.length; i++) posSum = mkOp('+', posSum, pos[i]);
    if (neg.length === 0) return posSum;
    let negSum = neg[0];
    for (let i = 1; i < neg.length; i++) negSum = mkOp('+', negSum, neg[i]);
    if (!posSum) return mkOp('-', num(0), negSum);
    return mkOp('-', posSum, negSum);
  }

  if (op === '+') {
    const terms = [];
    collectAddRaw(l, 1, terms);
    collectAddRaw(r, 1, terms);
    const pos = terms.filter(t => t.sign > 0).map(t => t.node).filter(n => !isNum(n, 0));
    const neg = terms.filter(t => t.sign < 0).map(t => t.node).filter(n => !isNum(n, 0));
    pos.sort((a, b) => canonStr(a).localeCompare(canonStr(b)));
    neg.sort((a, b) => canonStr(a).localeCompare(canonStr(b)));
    return buildSumDiff(pos, neg);
  }

  // 统一收集乘除法因子
  function collectMulRaw(node, power, factors) {
    if (node.type === 'op' && node.op === '*') {
      collectMulRaw(node.left, power, factors);
      collectMulRaw(node.right, power, factors);
    } else if (node.type === 'op' && node.op === '/') {
      collectMulRaw(node.left, power, factors);
      collectMulRaw(node.right, -power, factors);
    } else {
      factors.push({ node: normalize(node), power });
    }
  }

  function buildMulDiv(numArr, denArr) {
    if (numArr.length === 0 && denArr.length === 0) return num(1);
    let numProd = numArr.length > 0 ? numArr[0] : null;
    for (let i = 1; i < numArr.length; i++) numProd = mkOp('*', numProd, numArr[i]);
    if (denArr.length === 0) return numProd;
    let denProd = denArr[0];
    for (let i = 1; i < denArr.length; i++) denProd = mkOp('*', denProd, denArr[i]);
    if (!numProd) return mkOp('/', num(1), denProd);
    return mkOp('/', numProd, denProd);
  }

  if (op === '*') {
    const factors = [];
    collectMulRaw(l, 1, factors);
    collectMulRaw(r, 1, factors);
    const numArr = factors.filter(f => f.power > 0).map(f => f.node).filter(n => !isNum(n, 1));
    const denArr = factors.filter(f => f.power < 0).map(f => f.node).filter(n => !isNum(n, 1));
    numArr.sort((a, b) => canonStr(a).localeCompare(canonStr(b)));
    denArr.sort((a, b) => canonStr(a).localeCompare(canonStr(b)));
    return buildMulDiv(numArr, denArr);
  }

  if (op === '-') {
    const terms = [];
    collectAddRaw(l, 1, terms);
    collectAddRaw(r, -1, terms);
    const pos = terms.filter(t => t.sign > 0).map(t => t.node).filter(n => !isNum(n, 0));
    const neg = terms.filter(t => t.sign < 0).map(t => t.node).filter(n => !isNum(n, 0));
    pos.sort((a, b) => canonStr(a).localeCompare(canonStr(b)));
    neg.sort((a, b) => canonStr(a).localeCompare(canonStr(b)));
    return buildSumDiff(pos, neg);
  }

  if (op === '/') {
    const factors = [];
    collectMulRaw(l, 1, factors);
    collectMulRaw(r, -1, factors);
    const numArr = factors.filter(f => f.power > 0).map(f => f.node).filter(n => !isNum(n, 1));
    const denArr = factors.filter(f => f.power < 0).map(f => f.node).filter(n => !isNum(n, 1));
    numArr.sort((a, b) => canonStr(a).localeCompare(canonStr(b)));
    denArr.sort((a, b) => canonStr(a).localeCompare(canonStr(b)));
    return buildMulDiv(numArr, denArr);
  }

  return mkOp(op, l, r);
}

function canonStr(node) {
  if (node.type === 'num') return node.str;
  return '(' + canonStr(node.left) + node.op + canonStr(node.right) + ')';
}

// 显示用字符串
const OP_SYM = { '+': '+', '-': '-', '*': '×', '/': '÷' };
function prec(op) { return (op === '+' || op === '-') ? 1 : 2; }

function toDisplay(node, parentOp, isRight) {
  if (node.type === 'num') return node.str;
  const ls = toDisplay(node.left, node.op, false);
  const rs = toDisplay(node.right, node.op, true);
  let s = ls + OP_SYM[node.op] + rs;
  if (parentOp && (prec(node.op) < prec(parentOp) || (isRight && prec(node.op) === prec(parentOp)))) {
    s = '(' + s + ')';
  }
  return s;
}

function toDisplayRoot(node) { return toDisplay(node, null, false); }

function* permutations(arr) {
  const a = [...arr];
  function* p(l) {
    if (l === a.length) { yield [...a]; return; }
    for (let i = l; i < a.length; i++) {
      [a[l], a[i]] = [a[i], a[l]];
      yield* p(l + 1);
      [a[l], a[i]] = [a[i], a[l]];
    }
  }
  yield* p(0);
}

function main() {
  const results = {};
  let total = 0, solvable = 0;

  for (let a = 1; a <= 13; a++) {
    for (let b = a; b <= 13; b++) {
      for (let c = b; c <= 13; c++) {
        for (let d = c; d <= 13; d++) {
          total++;
          const cards = [a, b, c, d];
          const key = cards.join(',');
          const seen = new Set();
          const seenDisp = new Set();
          const exprs = [];

          for (const perm of permutations(cards)) {
            const nodes = perm.map(v => num(v));
            const trees = solve(nodes);
            for (const t of trees) {
              const nt = normalize(t);
              const k = canonStr(nt);
              if (!seen.has(k)) {
                seen.add(k);
                const disp = toDisplayRoot(nt);
                if (!seenDisp.has(disp)) {
                  seenDisp.add(disp);
                  exprs.push(disp);
                }
              }
            }
          }

          if (exprs.length > 0) {
            solvable++;
            results[key] = exprs;
          }
        }
      }
    }
  }

  console.error(`总: ${total}, 有解: ${solvable}, 无解: ${total - solvable}`);
  console.log(JSON.stringify({
    meta: { total, solvable, unsolvable: total - solvable, target: 24 },
    solutions: results,
  }));
}

main();
