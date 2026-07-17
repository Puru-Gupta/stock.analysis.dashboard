#!/usr/bin/env node
/**
 * Convert markdown to Microsoft Word-compatible .doc (HTML + Office XML).
 * Usage: node scripts/md-to-doc.js docs/STRATEGIES.md docs/STRATEGIES.doc
 */

const fs = require("fs");
const path = require("path");

const [,, inputPath, outputPath] = process.argv;
if (!inputPath || !outputPath) {
  console.error("Usage: node scripts/md-to-doc.js <input.md> <output.doc>");
  process.exit(1);
}

const md = fs.readFileSync(inputPath, "utf8");

function inline(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function parseTable(lines) {
  if (lines.length < 2) return "";
  const rows = lines.filter((l) => l.trim().startsWith("|"));
  if (rows.length < 2) return "";
  const parseRow = (row) =>
    row.split("|").slice(1, -1).map((c) => c.trim());
  const header = parseRow(rows[0]);
  const body = rows.slice(2).map(parseRow);
  let html = "<table border=\"1\" cellpadding=\"6\" cellspacing=\"0\" style=\"border-collapse:collapse;width:100%;margin:12pt 0;\">";
  html += "<tr>" + header.map((h) => `<th style=\"background:#f0f0f0;font-weight:bold;\">${inline(h)}</th>`).join("") + "</tr>";
  for (const row of body) {
    html += "<tr>" + row.map((c) => `<td>${inline(c)}</td>`).join("") + "</tr>";
  }
  html += "</table>";
  return html;
}

function mdToHtml(markdown) {
  const lines = markdown.split("\n");
  const out = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    if (line.startsWith("```")) {
      const lang = line.slice(3).trim();
      i++;
      const codeLines = [];
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++;
      out.push(
        `<pre style=\"background:#f5f5f5;padding:10pt;font-family:Consolas,monospace;font-size:9pt;border:1px solid #ddd;\"><code>${codeLines.map((l) => l.replace(/&/g, "&amp;").replace(/</g, "&lt;")).join("\n")}</code></pre>`,
      );
      continue;
    }

    if (line.trim().startsWith("|") && i + 1 < lines.length && lines[i + 1].includes("---")) {
      const tableLines = [line];
      i += 2;
      while (i < lines.length && lines[i].trim().startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }
      out.push(parseTable(tableLines));
      continue;
    }

    if (line.startsWith("# ")) {
      out.push(`<h1 style=\"font-size:22pt;color:#1a1a1a;border-bottom:2pt solid #333;padding-bottom:6pt;\">${inline(line.slice(2))}</h1>`);
    } else if (line.startsWith("## ")) {
      out.push(`<h2 style=\"font-size:16pt;color:#222;border-bottom:1pt solid #ccc;margin-top:18pt;\">${inline(line.slice(3))}</h2>`);
    } else if (line.startsWith("### ")) {
      out.push(`<h3 style=\"font-size:13pt;color:#333;margin-top:14pt;\">${inline(line.slice(4))}</h3>`);
    } else if (line.startsWith("#### ")) {
      out.push(`<h4 style=\"font-size:11pt;color:#444;margin-top:10pt;\">${inline(line.slice(5))}</h4>`);
    } else if (line.startsWith("> ")) {
      out.push(`<blockquote style=\"border-left:4pt solid #f59e0b;margin:10pt 0;padding:6pt 12pt;background:#fffbeb;\">${inline(line.slice(2))}</blockquote>`);
    } else if (line.trim() === "---") {
      out.push("<hr style=\"border:none;border-top:1pt solid #ccc;margin:16pt 0;\">");
    } else if (/^- \[ \] /.test(line)) {
      out.push(`<p style=\"margin:4pt 0;\">&#9744; ${inline(line.replace(/^- \[ \] /, ""))}</p>`);
    } else if (/^- \[x\] /.test(line)) {
      out.push(`<p style=\"margin:4pt 0;\">&#9746; ${inline(line.replace(/^- \[x\] /, ""))}</p>`);
    } else if (line.startsWith("- ")) {
      out.push(`<p style=\"margin:4pt 0 4pt 18pt;text-indent:-12pt;\">&#8226; ${inline(line.slice(2))}</p>`);
    } else if (/^\d+\. /.test(line)) {
      const m = line.match(/^(\d+)\. (.*)/);
      out.push(`<p style=\"margin:4pt 0 4pt 18pt;text-indent:-12pt;\">${m[1]}. ${inline(m[2])}</p>`);
    } else if (line.trim() === "") {
      out.push("<br>");
    } else {
      out.push(`<p style=\"margin:6pt 0;line-height:1.5;\">${inline(line)}</p>`);
    }
    i++;
  }
  return out.join("\n");
}

const title = path.basename(inputPath, path.extname(inputPath)).replace(/_/g, " ");
const body = mdToHtml(md);

const doc = `<html xmlns:o="urn:schemas-microsoft-com:office:office"
xmlns:w="urn:schemas-microsoft-com:office:word"
xmlns="http://www.w3.org/TR/REC-html40">
<head>
<meta charset="utf-8">
<meta name="ProgId" content="Word.Document">
<meta name="Generator" content="Money Dashboard md-to-doc">
<title>${title}</title>
<!--[if gte mso 9]><xml>
<w:WordDocument>
  <w:View>Print</w:View>
  <w:Zoom>100</w:Zoom>
  <w:DoNotOptimizeForBrowser/>
</w:WordDocument>
</xml><![endif]-->
<style>
  @page { size: A4; margin: 2.54cm; }
  body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; color: #1a1a1a; }
  code { font-family: Consolas, monospace; background: #f5f5f5; padding: 1pt 3pt; }
  table { font-size: 10pt; }
  th, td { border: 1px solid #999; padding: 5pt 8pt; vertical-align: top; }
  th { background: #f0f0f0; font-weight: bold; }
</style>
</head>
<body>
${body}
<p style="margin-top:24pt;font-size:9pt;color:#888;">Generated from ${path.basename(inputPath)} — Money Dashboard — ${new Date().toISOString().slice(0, 10)}</p>
</body>
</html>`;

fs.writeFileSync(outputPath, doc, "utf8");
console.log(`Created ${outputPath} (${(doc.length / 1024).toFixed(1)} KB)`);
