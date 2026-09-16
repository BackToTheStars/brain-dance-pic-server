// Range по RFC 9110 для файла размера size: full — 200 и весь файл (нет заголовка, он негоден или
// диапазонов несколько), partial — 206 (end включительно), unsatisfiable — 416 с bytes */size.
const FULL = { kind: 'full' };
const UNSATISFIABLE = { kind: 'unsatisfiable' };

const SPEC_RE = /^(\d*)-(\d*)$/;

function parseRange(header, size) {
  if (typeof header !== 'string') {
    return FULL;
  }

  const eq = header.indexOf('=');
  if (eq === -1 || header.slice(0, eq).trim().toLowerCase() !== 'bytes') {
    return FULL;
  }

  const specs = header
    .slice(eq + 1)
    .split(',')
    .map((spec) => spec.trim())
    .filter(Boolean);
  if (specs.length !== 1) {
    return FULL;
  }

  const match = SPEC_RE.exec(specs[0]);
  if (!match || (match[1] === '' && match[2] === '')) {
    return FULL;
  }

  if (match[1] === '') {
    const suffix = Number(match[2]);
    if (suffix === 0 || size === 0) {
      return UNSATISFIABLE;
    }

    return { kind: 'partial', start: Math.max(0, size - suffix), end: size - 1 };
  }

  const start = Number(match[1]);
  const last = match[2] === '' ? null : Number(match[2]);
  if (last !== null && last < start) {
    return FULL;
  }
  if (start >= size) {
    return UNSATISFIABLE;
  }

  return {
    kind: 'partial',
    start,
    end: last === null ? size - 1 : Math.min(last, size - 1),
  };
}

module.exports = { parseRange };
