// Fast drop-in for csv-reader 1.0.0.
//
// run({ text, header }) returns { columns, rows, errors } with exactly
// csv-reader's reading of the input:
//
// - The text is read once, left to right, with commas and double quotes.
// - A U+FEFF at its very start is dropped.
// - A record ends at LF or CRLF; a line left with no characters is no record.
// - Outside quotes a CR not followed by LF is dropped (error stray_cr).
// - A field that opens with a quote runs to the next quote that is not
//   doubled ("" inside it is one quote, and each CRLF or lone CR inside it
//   is read as LF); what follows its closing quote, up to the next comma or
//   line break, is appended as it stands (error quote_junk, when the field
//   ends); a quote that never closes is a literal character, and the text
//   after it is read again as unquoted (error unterminated_quote).
// - A quote inside an unquoted field is a literal character.
// - Fields stay strings, never trimmed or converted.
// - columns is the first record when header is true, else null; rows holds
//   the records after it (every record when header is false), each padded
//   with empty strings (error short_row, with fields: its field count) or
//   cut (error long_row, with extra: the cut fields) to the first record's
//   width.
// - Each error is { code, line, row }, in the order met, line the 1-based
//   line its record starts on (counting every LF, CRLF and lone CR inside
//   quotes), row its record's index in rows, null for the header; a
//   record's short_row or long_row is reported when it ends.
//
// Speed: field ends are found with native indexOf scans (the next comma
// and the next line break), fields are taken with single slices, and
// per-character work happens only inside quoted fields that actually need
// unescaping or hold line breaks. A CR inside a field is found by scanning
// the sliced value, which is short, so the common path never hunts for it
// across the whole text.

/**
 * @param {{ text: string, header: boolean }} input
 * @returns {{ columns: string[] | null, rows: string[][], errors: object[] }}
 */
export function run(input) {
  const text = input.text;
  const header = input.header;
  const n = text.length;
  const rows = [];
  const errors = [];
  let columns = null;
  let width = -1;
  let line = 1;
  let recIndex = 0;
  let i = 0;
  if (n > 0 && text.charCodeAt(0) === 0xfeff) i = 1;

  outer: while (i < n) {
    // A line left with no characters is no record. A lone CR at a line
    // start is outside quotes and not followed by LF: dropped, stray_cr.
    const c0 = text.charCodeAt(i);
    if (c0 === 10) {
      i += 1;
      line += 1;
      continue;
    }
    if (c0 === 13) {
      if (text.charCodeAt(i + 1) === 10) {
        i += 2;
        line += 1;
        continue;
      }
      errors.push({
        code: 'stray_cr',
        line,
        row: header && recIndex === 0 ? null : recIndex - (header ? 1 : 0),
      });
      i += 1;
      continue;
    }

    const recStartLine = line;
    const rowIdx =
      header && recIndex === 0 ? null : recIndex - (header ? 1 : 0);
    const fields = [];

    // ---- fields of one record ----
    while (true) {
      let value;
      // term: 44 comma, 10 line break, 0 end of text. i is left just
      // past the terminator; line is already advanced past a line break.
      let term;
      let handled = false;

      if (text.charCodeAt(i) === 34) {
        // A field that opens with a quote: find its closing quote.
        let j = text.indexOf('"', i + 1);
        while (j !== -1 && text.charCodeAt(j + 1) === 34) {
          j = text.indexOf('"', j + 2);
        }
        if (j !== -1) {
          handled = true;
          const content = text.slice(i + 1, j);
          if (
            content.indexOf('"') === -1 &&
            content.indexOf('\r') === -1 &&
            content.indexOf('\n') === -1
          ) {
            value = content;
          } else {
            // Unescape "" and normalise every line break inside the
            // quotes to LF, counting each one for the line number.
            let out = '';
            let k = 0;
            const m = content.length;
            while (k < m) {
              const c = content.charCodeAt(k);
              if (c === 34) {
                out += '"';
                k += 2;
              } else if (c === 13) {
                out += '\n';
                line += 1;
                k += content.charCodeAt(k + 1) === 10 ? 2 : 1;
              } else if (c === 10) {
                out += '\n';
                line += 1;
                k += 1;
              } else {
                let k2 = k + 1;
                while (k2 < m) {
                  const c2 = content.charCodeAt(k2);
                  if (c2 === 34 || c2 === 13 || c2 === 10) break;
                  k2 += 1;
                }
                out += content.slice(k, k2);
                k = k2;
              }
            }
            value = out;
          }

          // What follows the closing quote, up to the next comma or line
          // break, is appended as it stands (quote_junk when the field
          // ends). A CR in there that is not part of a CRLF is a stray CR:
          // dropped, stray_cr, and the junk goes on.
          let k = j + 1;
          const jc = text.indexOf(',', k);
          const jl = text.indexOf('\n', k);
          let jend;
          let jterm;
          if (jl !== -1 && (jc === -1 || jl < jc)) {
            jend = jl > k && text.charCodeAt(jl - 1) === 13 ? jl - 1 : jl;
            jterm = 10;
          } else if (jc !== -1) {
            jend = jc;
            jterm = 44;
          } else {
            jend = n;
            jterm = 0;
          }
          let tail = text.slice(k, jend);
          if (tail.indexOf('\r') !== -1) {
            const parts = tail.split('\r');
            for (let q = 1; q < parts.length; q++) {
              errors.push({ code: 'stray_cr', line: recStartLine, row: rowIdx });
            }
            tail = parts.join('');
          }
          if (tail !== '') {
            value += tail;
            errors.push({ code: 'quote_junk', line: recStartLine, row: rowIdx });
          }
          if (jterm === 44) {
            i = jend + 1;
            term = 44;
          } else if (jterm === 10) {
            i = jend + (text.charCodeAt(jend) === 13 ? 2 : 1);
            line += 1;
            term = 10;
          } else {
            i = n;
            term = 0;
          }
        } else {
          // A quote that never closes is a literal character, and the
          // text after it is read again as unquoted.
          errors.push({
            code: 'unterminated_quote',
            line: recStartLine,
            row: rowIdx,
          });
        }
      }

      if (!handled) {
        // Unquoted field: it ends at the next comma or line break. A CR
        // inside it that is not part of a CRLF is dropped (stray_cr) and
        // the field goes on; it is found by scanning the sliced value,
        // which is short.
        const c = text.indexOf(',', i);
        const l = text.indexOf('\n', i);
        let end;
        if (l !== -1 && (c === -1 || l < c)) {
          end = l > i && text.charCodeAt(l - 1) === 13 ? l - 1 : l;
          term = 10;
        } else if (c !== -1) {
          end = c;
          term = 44;
        } else {
          end = n;
          term = 0;
        }
        value = text.slice(i, end);
        if (value.indexOf('\r') !== -1) {
          const parts = value.split('\r');
          for (let q = 1; q < parts.length; q++) {
            errors.push({ code: 'stray_cr', line: recStartLine, row: rowIdx });
          }
          value = parts.join('');
        }
        if (term === 44) {
          i = end + 1;
        } else if (term === 10) {
          i = end + (text.charCodeAt(end) === 13 ? 2 : 1);
          line += 1;
        } else {
          i = n;
        }
      }

      fields.push(value);
      if (term === 44) continue;
      break;
    }

    // ---- the record ends: pad or cut it to the first record's width ----
    if (width === -1) {
      width = fields.length;
      if (header) {
        columns = fields;
      } else {
        rows.push(fields);
      }
    } else if (fields.length < width) {
      errors.push({
        code: 'short_row',
        line: recStartLine,
        row: rowIdx,
        fields: fields.length,
      });
      while (fields.length < width) fields.push('');
      rows.push(fields);
    } else if (fields.length > width) {
      const extra = fields.slice(width);
      errors.push({
        code: 'long_row',
        line: recStartLine,
        row: rowIdx,
        extra,
      });
      rows.push(fields.slice(0, width));
    } else {
      rows.push(fields);
    }
    recIndex += 1;
    if (i >= n) break outer;
  }

  // With a header and no record at all, columns is the empty record.
  if (header && columns === null) columns = [];

  return { columns, rows, errors };
}
