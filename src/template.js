// Thay biến {{vars.x}} trong tham số node. Định dạng giống flow bản gốc:
// - chuỗi chỉ gồm một template → trả về giá trị thô (mảng, object, số…)
// - template nằm trong chuỗi → chèn chuỗi; mảng/object thì chèn JSON
// - bên trong {{ }} có thể là biểu thức JS, ví dụ {{vars.model && ('?model=' + vars.model) || ''}}
const TPL = /\{\{\s*([\s\S]+?)\s*\}\}/g;
const WHOLE = /^\{\{\s*([\s\S]+?)\s*\}\}$/;

function lookup(vars, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), vars);
}

export function evalExpr(expr, vars) {
  const m = expr.match(/^vars((?:\.[\w$]+)+)$/);
  if (m) return lookup(vars, m[1].slice(1));
  try { return new Function('vars', `"use strict"; return (${expr});`)(vars); } catch { return ''; }
}

export function render(val, vars) {
  if (typeof val === 'string') {
    const whole = val.match(WHOLE);
    if (whole) { const v = evalExpr(whole[1], vars); return v === undefined ? null : v; }
    return val.replace(TPL, (_, e) => {
      const v = evalExpr(e, vars);
      return v == null ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    });
  }
  if (Array.isArray(val)) return val.map(v => render(v, vars));
  if (val && typeof val === 'object') return Object.fromEntries(Object.entries(val).map(([k, v]) => [k, render(v, vars)]));
  return val;
}

export function truthy(v) {
  if (v == null) return false;
  if (typeof v === 'string') return !['', 'false', '0', 'null', 'none', 'undefined', '[]', '{}'].includes(v.trim().toLowerCase());
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === 'object') return Object.keys(v).length > 0;
  return !!v;
}

// Biểu thức của node condition: "{{vars.a}} == yes", "{{vars.n}} < 3", hoặc chỉ "{{vars.flag}}"
export function evalCondition(exprRaw, vars) {
  const raw = String(exprRaw ?? '').trim();
  const whole = raw.match(WHOLE);
  if (whole) return truthy(evalExpr(whole[1], vars));
  const s = String(render(raw, vars) ?? '');
  const m = s.match(/^([\s\S]*?)\s*(==|!=|>=|<=|>|<)\s*([\s\S]*)$/);
  if (!m) return truthy(s);
  let [, a, op, b] = m; a = a.trim(); b = b.trim();
  const na = Number(a), nb = Number(b);
  if (a !== '' && b !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) { a = na; b = nb; }
  switch (op) {
    case '==': return a == b; // eslint-disable-line eqeqeq
    case '!=': return a != b; // eslint-disable-line eqeqeq
    case '>': return a > b;
    case '<': return a < b;
    case '>=': return a >= b;
    default: return a <= b;
  }
}
