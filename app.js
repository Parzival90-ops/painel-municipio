(function () {
  "use strict";
  const D = JSON.parse(document.getElementById("dados").textContent);
  const $ = (id) => document.getElementById(id);
  const el = (tag, attrs, ...filhos) => { const e = document.createElement(tag); if (attrs) for (const [k, v] of Object.entries(attrs)) { if (v == null) continue; if (k === "style") e.style.cssText = v; else if (k === "class") e.className = v; else e.setAttribute(k, v); } for (const f of filhos) if (f != null && f !== false) e.append(f instanceof Node ? f : document.createTextNode(String(f))); return e; };
  const HOJE = D.meta.data_ref_iso;
  const AREAS = Object.fromEntries(D.areas.map((a) => [a.id, a]));
  const UF_NOME = { MA: "Maranhão", PI: "Piauí" };

  // ---------- Situação (mesma regra do painel geral) ----------
  const SIT_VAR = { "Garantido": "--s-garantida", "No caminho": "--s-alcancavel", "Atenção pendências": "--s-depende", "Dificuldade na entrega": "--s-inviavel", "Atenção máxima": "--s-critico", "Atenção": "--s-risco" };
  const SIT_IC = { "Garantido": "✓", "No caminho": "◷", "Atenção pendências": "⚠", "Dificuldade na entrega": "✕", "Atenção máxima": "‼", "Atenção": "!" };
  const chip = (s) => el("span", { class: "chip" }, el("span", { class: "ic", style: `background:var(${SIT_VAR[s]})`, "aria-hidden": "true" }, SIT_IC[s]), s);
  const folga = (s) => s[1] + 2 * (s[3] + s[4]) - s[2];
  function riscoArea(s, a) {
    if (!s || s[0] === "Dificuldade na entrega" || s[0] === "Garantido") return null;
    const lim = (AREAS[a] || {}).max_zeros, f = folga(s), zero = lim != null && lim > 0 && s[5] === lim;
    if (f <= 0) return "critico";
    return f <= 1 || zero ? "risco" : null;
  }
  const sitArea = (s, a) => { const r = riscoArea(s, a); return r ? (r === "critico" ? "Atenção máxima" : "Atenção") : s[0]; };
  const sitMunicipio = (m) => { if (m.sg === "Dificuldade na entrega") return m.sg; const rs = Object.entries(m.s).map(([a, s]) => riscoArea(s, a)).filter(Boolean); return rs.includes("critico") ? "Atenção máxima" : rs.length ? "Atenção" : m.sg; };

  // ---------- Duas próximas janelas de entrega: as duas próximas datas de prazo a partir de hoje (gestor, 17/11/2026) ----------
  const JANELAS = [...new Set(D.entregas.map((e) => e.iso).filter((iso) => iso && iso >= HOJE))].sort().slice(0, 2);
  const naJanela = (e) => JANELAS.includes(e.iso);
  // ---------- As cores ----------
  const COR = {
    verde: { nome: "Entregue", ic: "✓", d: "registrada como entregue (no prazo ou com atraso)" },
    amarelo: { nome: "Pendente", ic: "!", d: "prazo encerrado, entrega ainda sem registro definitivo" },
    vermelho: { nome: "Entrega não identificada", ic: "✕", d: "prazo encerrado e registro negativo: tarefa zerada" },
    azul: { nome: "No prazo, em andamento", ic: "…", d: "prazo aberto e o município já informou o que falta" },
    azulclaro: { nome: "Próxima entrega", ic: "→", d: "vence numa das duas próximas janelas de entrega, ainda sem dado" },
    cinza: { nome: "Prazo futuro", ic: "◷", d: "prazo aberto, sem nenhum dado de entrega" },
  };
  const ORDEM = ["verde", "amarelo", "vermelho", "azul", "azulclaro", "cinza"];
  const fmtData = (iso) => iso ? iso.slice(8, 10) + "/" + iso.slice(5, 7) + "/" + iso.slice(0, 4) : "sem prazo";
  const isoDe = (br) => { const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(br || ""); return m ? m[3] + "-" + m[2] + "-" + m[1] : null; };
  const dias = (iso) => Math.round((Date.parse(iso) - Date.parse(HOJE)) / 864e5);
  // rotulos: [texto, situação do rótulo (ok|parcial|zero|analise|vazio), pontos]
  function registro(m, i) {
    const e = D.entregas[i], r = m.e[i], vencida = !!(e.iso && e.iso < HOJE);
    if (r === -1 || D.rotulos[r[0]][1] === "vazio") {
      const semCol = r === -1 || (vencida && D.nao_acompanhadas[m.uf].includes(e.id));
      return { cor: vencida ? "amarelo" : naJanela(e) ? "azulclaro" : "cinza", rot: "", data: r === -1 ? "" : r[1], obs: vencida ? (semCol ? "não acompanhada pela planilha" : "sem registro na planilha") : "" };
    }
    const [t, st, pts] = D.rotulos[r[0]];
    if (st === "ok" || st === "parcial") return { cor: "verde", rot: t, pts, data: r[1], obs: st === "parcial" ? "entregue com atraso (1 ponto)" : "" };
    if (!vencida) return { cor: "azul", rot: t, data: r[1], obs: "" };          // movimentação antes do prazo (inclusive registro negativo)
    if (st === "zero") return { cor: "vermelho", rot: t, pts: 0, data: r[1], obs: "" };
    return { cor: "amarelo", rot: t, data: r[1], obs: "em análise" };
  }
  const bolinha = (cor) => el("span", { class: "ic", style: `background:var(--c-${cor})`, "aria-hidden": "true" }, COR[cor].ic);

  // ---------- Guia, notas do gestor e notícias ----------
  const paginas = (txt) => { const ps = (txt || "").split(/[;,]/).map((p) => p.trim()).filter((p) => /^\d+$/.test(p)); return ps.length ? el("span", null, "(Guia Metodológico v3, ", ...ps.flatMap((p, k) => [k ? ", " : "", el("a", { href: D.meta.guia_pdf + "#page=" + p, target: "_blank", rel: "noopener" }, "p. " + p)]), ")") : null; };

  function linhaEntrega(m, i, comArea) {
    const e = D.entregas[i], r = registro(m, i), d = e.iso ? dias(e.iso) : null;
    const quando = d == null ? "" : d < 0 ? "prazo encerrado" : d === 0 ? "vence hoje" : "faltam " + d + " dias";
    const sub = [r.rot ? "“" + r.rot + "”" : "", r.obs, r.data ? "entregue em " + r.data : ""].filter(Boolean).join(" · ");
    const det = el("details", { class: "ent", style: `--cor:var(--c-${r.cor})` },
      el("summary", null,
        el("span", { class: "st" }, bolinha(r.cor), COR[r.cor].nome),
        el("span", { class: "nome-ent" }, comArea ? el("strong", null, e.area + " · ") : null, e.nome, sub ? el("span", { class: "rot" }, sub) : null),
        el("span", { class: "prazo" }, fmtData(e.iso), el("small", null, quando)),
        el("span", { class: "seta", "aria-hidden": "true" }, "›")));
    det.addEventListener("toggle", () => { if (det.open && det.children.length === 1) det.append(detalhe(m, e, r)); });
    return det;
  }
  function detalhe(m, e, r) {
    const [descricao, metaG, , , pags] = e.guia;   // como comprovar, onde é verificado e quando se aplica ficam fora (gestor, 17/11/2026)
    const guia = el("dl", null,
      el("dt", null, "O que é"), el("dd", null, descricao || e.nome),
      metaG ? el("dt", null, "Meta") : null, metaG ? el("dd", null, metaG) : null,
      el("dt", null, "Referência"), el("dd", null, paginas(pags) || "Guia Metodológico v3"));
    const dd = (D.dados_do_dia[m.uf] || {})[e.id];
    const reg = el("dl", null,
      el("dt", null, "Situação"), el("dd", null, COR[r.cor].nome + (r.obs ? " (" + r.obs + ")" : "")),
      r.rot ? el("dt", null, "Registro na planilha") : null, r.rot ? el("dd", null, "“" + r.rot + "”") : null,
      r.pts != null ? el("dt", null, "Pontos") : null, r.pts != null ? el("dd", null, String(r.pts)) : null,
      r.data ? el("dt", null, "Entregue em") : null, r.data ? el("dd", null, r.data) : null,
      el("dt", null, "Dados do dia"), el("dd", null, dd ? fmtData(dd) : "sem data de extração na planilha"),
      el("dt", null, "Prazo"), el("dd", null, el("strong", null, fmtData(e.iso))));
    return el("div", { class: "detalhe" },
      el("div", null, el("h4", null, "O que o Guia pede"), guia),
      el("div", null, el("h4", null, "Registro do município"), reg));
  }

  // ---------- Relatório para imprimir: entregas feitas e próximas entregas, por data (gestor, 17/11/2026) ----------
  const hesc = (v) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  // Coluna "Entregue em": desligada até os dados recebidos trazerem a data de entrega (gestor, 17/11/2026)
  const RELATORIO_COM_DATA_ENTREGA = false;
  const COR_HEX = { verde: "#0ca30c", amarelo: "#fab219", vermelho: "#d03b3b", azul: "#4a90e2", azulclaro: "#a9dcf7", cinza: "#c3c2b7" };
  function relatorioMunicipio(m) {
    const idx = D.entregas.map((e, i) => i), regs = idx.map((i) => registro(m, i)), ent = (i) => D.entregas[i];
    const feitas = idx.filter((i) => regs[i].cor === "verde").sort((a, b) => (ent(a).iso || "9").localeCompare(ent(b).iso || "9"));
    const pendentes = idx.filter((i) => regs[i].cor === "amarelo").sort((a, b) => (ent(a).iso || "9").localeCompare(ent(b).iso || "9"));
    const dificuldade = idx.filter((i) => regs[i].cor === "vermelho").sort((a, b) => (ent(a).iso || "9").localeCompare(ent(b).iso || "9"));
    const linhaVencida = (i) => { const r = regs[i]; return `<tr style="--c:${COR_HEX[r.cor]}"><td class="data">${hesc(fmtData(ent(i).iso))}</td><td>${area(ent(i).area)}</td><td>${hesc(ent(i).nome)}</td><td>${pilula(r.cor, r.rot || COR[r.cor].nome)}${r.obs ? `<div class="obs">${hesc(r.obs)}</div>` : ""}</td></tr>`; };
    const tabelaVencidas = (lista, vazio) => lista.length ? `<table class="feitas"><colgroup><col class="c1"><col class="c2"><col><col class="c4"></colgroup><thead><tr><th>Prazo</th><th>Área</th><th>Atividade</th><th>Registro</th></tr></thead><tbody>${lista.map(linhaVencida).join("")}</tbody></table>` : `<p class="resumo">${vazio}</p>`;
    const proximas = idx.filter((i) => regs[i].cor !== "verde" && ent(i).iso && ent(i).iso >= HOJE).sort((a, b) => ent(a).iso.localeCompare(ent(b).iso) || a - b);
    const area = (id) => { const c = (AREAS[id] || {}).cor || "#898781"; return `<span class="area" style="border-color:${c};background:${c}1f"><i style="background:${c}"></i>${hesc(id)}</span>`; };
    const pilula = (cor, txt) => `<span class="pil" style="background:${COR_HEX[cor]}${cor === "azulclaro" || cor === "cinza" ? "" : "26"};border-color:${COR_HEX[cor]}"><b style="background:${COR_HEX[cor]}">${COR[cor].ic}</b>${hesc(txt)}</span>`;
    const comData = RELATORIO_COM_DATA_ENTREGA && feitas.some((i) => regs[i].data);
    const linhaFeita = (i) => `<tr style="--c:${COR_HEX.verde}"><td class="data">${hesc(fmtData(ent(i).iso))}</td><td>${area(ent(i).area)}</td><td>${hesc(ent(i).nome)}</td><td>${pilula("verde", regs[i].rot || "Entregue")}${regs[i].obs ? `<div class="obs">${hesc(regs[i].obs)}</div>` : ""}</td>${comData ? `<td>${hesc(regs[i].data || "—")}</td>` : ""}</tr>`;
    const porData = (lista) => { let blocos = "", ult = null;
    for (const i of lista) {
      const iso = ent(i).iso, jan = JANELAS.includes(iso);
      if (iso !== ult) { if (ult) blocos += "</tbody></table>"; ult = iso; const d = dias(iso);
        blocos += `<h3 class="${jan ? "janela" : ""}"><span class="dt">Até ${hesc(fmtData(iso))}</span><span class="dias">${d === 0 ? "vence hoje" : "faltam " + d + " dias"}</span>${jan ? '<span class="tagj">próxima janela</span>' : ""}</h3><table class="prox"><colgroup><col class="c2"><col><col class="c3"></colgroup><thead><tr><th>Área</th><th>Atividade</th><th>Situação</th></tr></thead><tbody>`; }
      const r = regs[i];
      blocos += `<tr style="--c:${COR_HEX[r.cor]}"><td>${area(ent(i).area)}</td><td>${hesc(ent(i).nome)}</td><td>${pilula(r.cor, COR[r.cor].nome)}${r.rot ? `<div class="obs">“${hesc(r.rot)}”</div>` : ""}</td></tr>`;
    }
    if (ult) blocos += "</tbody></table>"; return blocos; };
    const proxJan = proximas.filter((i) => JANELAS.includes(ent(i).iso)), futuro = proximas.filter((i) => !JANELAS.includes(ent(i).iso));
    const cont = {}; for (const i of idx) cont[regs[i].cor] = (cont[regs[i].cor] || 0) + 1;
    const resumo = ORDEM.filter((c) => cont[c]).map((c) => `<span class="chip" style="border-color:${COR_HEX[c]}"><b style="background:${COR_HEX[c]}">${cont[c]}</b>${hesc(COR[c].nome)}</span>`).join("");
    const doc = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório — ${hesc(m.n)} (${hesc(m.uf)})</title><style>
      *{-webkit-print-color-adjust:exact;print-color-adjust:exact} body{font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:#0b0b0b;margin:0;background:#fff}
      header{background:linear-gradient(120deg,#82d1ef,#bfe7f7);padding:20px 28px;border-radius:0 0 18px 18px} header h1{margin:0;font-size:23px} header .sit{display:inline-block;margin-top:8px;font-size:13px;font-weight:600;background:#fff;border-radius:999px;padding:3px 12px} header .m{font-size:12px;margin-top:6px;color:#2b4a57}
      main{padding:8px 28px 28px;max-width:1000px} .chips{display:flex;flex-wrap:wrap;gap:8px;margin:16px 0 4px} .chip{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;border:1.5px solid;border-radius:999px;padding:2px 10px 2px 3px;font-weight:600} .chip b{min-width:22px;height:22px;border-radius:999px;color:#0b0b0b;display:inline-flex;align-items:center;justify-content:center;font-size:12px;padding:0 5px}
      h2{font-size:18px;margin:24px 0 8px;padding:6px 12px;border-radius:8px} h2.feitas{background:#0ca30c1f;border-left:5px solid #0ca30c} h2.prox{background:#4a90e21f;border-left:5px solid #4a90e2} h2.pend{background:#fab2192e;border-left:5px solid #fab219} h2.dif{background:#d03b3b1f;border-left:5px solid #d03b3b} h2.fut{background:#c3c2b733;border-left:5px solid #a8a79f}
      h3{display:flex;align-items:center;gap:10px;font-size:14px;margin:16px 0 4px} h3 .dias{font-weight:500;color:#52514e;font-size:12px;background:#f2f1ed;border-radius:999px;padding:1px 9px} h3.janela .dt{color:#0f739a} .tagj{font-size:11px;font-weight:700;background:#a9dcf7;color:#054963;border-radius:999px;padding:1px 9px}
      table{border-collapse:collapse;width:100%;font-size:12.5px;table-layout:fixed} th,td{text-align:left;padding:6px 7px;border-bottom:1px solid #e1e0d9;vertical-align:top} th{color:#52514e;font-size:11.5px;background:#f9f9f7} tbody tr td:first-child{box-shadow:inset 4px 0 0 var(--c)}
      table.feitas col.c1{width:90px} table.feitas col.c2,table.prox col.c2{width:86px} table.feitas col.c4{width:190px} table.feitas col.c5{width:92px} table.prox col.c3{width:220px} td.data{font-variant-numeric:tabular-nums;font-weight:600}
      .area{display:inline-flex;align-items:center;gap:5px;font-size:11.5px;font-weight:700;border:1px solid;border-radius:5px;padding:1px 6px;white-space:nowrap} .area i{width:8px;height:8px;border-radius:2px;display:inline-block}
      .pil{display:inline-flex;align-items:center;gap:6px;font-size:12px;font-weight:600;border:1px solid;border-radius:999px;padding:1px 9px 1px 2px} .pil b{width:17px;height:17px;border-radius:50%;color:#0b0b0b;display:inline-flex;align-items:center;justify-content:center;font-size:10px} .obs{font-size:11.5px;color:#52514e;margin-top:3px}
      .resumo{font-size:13px;color:#52514e} .aviso{font-size:11px;color:#52514e;margin-top:22px} .barra{position:sticky;top:0;background:#f9f9f7;padding:8px 28px;border-bottom:1px solid #e1e0d9;z-index:1}
      .barra button{font:inherit;padding:6px 12px;border-radius:8px;border:1px solid #1cabe2;background:#fff;cursor:pointer} @media print{.barra{display:none} tr{break-inside:avoid} h3{break-after:avoid}}
      </style></head><body><div class="barra"><button onclick="print()">🖨 Imprimir / salvar em PDF</button></div>
      <header><h1>${hesc(m.n)} (${hesc(UF_NOME[m.uf])}) — Selo UNICEF 2025-2028</h1><div class="sit">Situação na simulação: ${hesc(sitMunicipio(m))}</div><div class="m">${hesc(D.meta.aviso)} · Referência: ${hesc(D.meta.data_ref)}</div></header><main>
      <div class="chips">${resumo}</div>
      <h2 class="feitas">✓ Entregas feitas (${feitas.length})</h2>${feitas.length ? `<table class="feitas"><colgroup><col class="c1"><col class="c2"><col><col class="c4">${comData ? '<col class="c5">' : ""}</colgroup><thead><tr><th>Prazo</th><th>Área</th><th>Atividade</th><th>Registro</th>${comData ? "<th>Entregue em</th>" : ""}</tr></thead><tbody>${feitas.map(linhaFeita).join("")}</tbody></table>` : "<p>Nenhuma entrega registrada até agora.</p>"}
      <h2 class="prox">→ Próximas entregas (${proxJan.length})</h2><p class="resumo">Atividades das duas próximas janelas de entrega${JANELAS.length ? " (" + JANELAS.map(fmtData).join(" e ") + ")" : ""}, organizadas por data.</p>${porData(proxJan) || "<p class=\"resumo\">Não há entregas nas próximas janelas.</p>"}
      <h2 class="dif">✕ Dificuldade na entrega (${dificuldade.length})</h2><p class="resumo">Prazo encerrado e entrega não identificada: registro negativo na planilha (tarefa zerada).</p>${tabelaVencidas(dificuldade, "Nenhuma entrega com dificuldade.")}
      <h2 class="pend">! Pendentes (${pendentes.length})</h2><p class="resumo">Prazo encerrado, ainda sem registro definitivo na planilha (em análise, faltando algo ou sem registro). Ainda podem pontuar.</p>${tabelaVencidas(pendentes, "Nenhuma pendência.")}
      <h2 class="fut">◷ Prazo futuro (${futuro.length})</h2><p class="resumo">Atividades com prazo mais adiante, organizadas por data.</p>${porData(futuro) || "<p class=\"resumo\">Não há outras entregas a vencer.</p>"}
      <p class="aviso">${hesc(D.meta.rodape)}</p></main></body></html>`;
    abrirRelatorio("relatorio_" + m.n.replace(/\s+/g, "_") + "_" + m.uf + ".html", doc);
  }
  $("b-relatorio").onclick = () => relatorioMunicipio(D.mun[estado.cod]);

    // ---------- Exportação .xlsx (zip sem compressão, sem bibliotecas) ----------
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  function zip(arquivos) {
    const enc = new TextEncoder(), partes = [], central = []; let pos = 0;
    const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    for (const [nome, texto] of arquivos) {
      const n = enc.encode(nome), d = enc.encode(texto), c = crc32(d);
      const cab = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(n.length), ...u16(0)];
      partes.push(new Uint8Array(cab), n, d);
      central.push([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(c), ...u32(d.length), ...u32(d.length), ...u16(n.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(pos)], n);
      pos += cab.length + n.length + d.length;
    }
    let tam = 0; const cd = [];
    for (let i = 0; i < central.length; i += 2) { const a = new Uint8Array(central[i]); cd.push(a, central[i + 1]); tam += a.length + central[i + 1].length; }
    const fim = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(arquivos.length), ...u16(arquivos.length), ...u32(tam), ...u32(pos), ...u16(0)]);
    return new Blob([...partes, ...cd, fim], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  }
  const xesc = (v) => String(v).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "");
  function aba(linhas, larguras) {
    const col = (i) => { let s = ""; i++; while (i) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; };
    const rows = linhas.map((l, r) => `<row r="${r + 1}">` + l.map((v, c) => v === "" || v == null ? "" : (typeof v === "number" ? `<c r="${col(c)}${r + 1}"><v>${v}</v></c>` : `<c r="${col(c)}${r + 1}" t="inlineStr"${r === 0 ? ' s="1"' : ""}><is><t xml:space="preserve">${xesc(v)}</t></is></c>`)).join("") + "</row>").join("");
    const cols = larguras ? "<cols>" + larguras.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join("") + "</cols>" : "";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rows}</sheetData><autoFilter ref="A1:${col(linhas[0].length - 1)}${linhas.length}"/></worksheet>`;
  }
  function xlsx(abas) {
    const nomes = abas.map((a) => a[0]);
    const arquivos = [
      ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${nomes.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}</Types>`],
      ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
      ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${nomes.map((n, i) => `<sheet name="${xesc(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`],
      ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${nomes.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}<Relationship Id="rId${nomes.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
      ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="2"><xf xfId="0"/><xf fontId="1" xfId="0" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
      ...abas.map((a, i) => [`xl/worksheets/sheet${i + 1}.xml`, aba(a[1], a[2])]),
    ];
    return zip(arquivos);
  }

  // ---------- Salvar arquivos ----------
  // No claude.ai a página só pode salvar arquivos pela capacidade "downloads" (o download comum do navegador é bloqueado).
  // A capacidade é pedida já na abertura; se não estiver disponível, a página oferece copiar os dados ou ver o relatório na tela.
  const NO_CLAUDE = !!(window.claude && typeof window.claude.use === "function");
  const DL_PROMESSA = NO_CLAUDE ? window.claude.use("downloads").catch(() => null) : Promise.resolve(null);
  function avisar(texto) {
    let t = document.getElementById("aviso-download");
    if (!t) { t = document.createElement("div"); t.id = "aviso-download"; t.setAttribute("role", "status");
      t.style.cssText = "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;position:fixed;left:50%;bottom:calc(16px + env(safe-area-inset-bottom, 0px));transform:translateX(-50%);background:var(--surface-1);color:var(--text-primary);border:1px solid var(--border);border-radius:8px;padding:8px 14px;font-size:13px;box-shadow:0 4px 16px rgba(0,0,0,.15);z-index:30;max-width:90vw";
      document.body.append(t); }
    t.textContent = texto; t.hidden = false; clearTimeout(t._tm); t._tm = setTimeout(() => { t.hidden = true; }, 6000);
  }
  const paraTSV = (linhas) => linhas.map((l) => l.map((v) => String(v == null ? "" : v).replace(/[\t\r\n]+/g, " ")).join("\t")).join("\n");
  async function copiarTexto(texto, rotulo) {
    try { await navigator.clipboard.writeText(texto); avisar(rotulo + " copiado. Cole no Excel ou no Google Sheets."); return; } catch (e) { /* segue para a seleção manual */ }
    const ta = document.getElementById("alt-texto"); if (ta) { ta.hidden = false; ta.value = texto; ta.focus(); ta.select(); avisar("Copie o texto selecionado (Ctrl+C)."); }
  }
  // Janela do próprio painel com as alternativas ao download
  function janelaAlternativa(titulo, motivo, abas, html, repetir) {
    let fundo = document.getElementById("alt-fundo");
    if (fundo) fundo.remove();
    document.body.classList.remove("com-relatorio");
    fundo = document.createElement("div"); fundo.id = "alt-fundo";
    fundo.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.45);z-index:25;display:flex;align-items:flex-start;justify-content:center;padding:calc(24px + env(safe-area-inset-top, 0px)) max(16px, env(safe-area-inset-right, 0px)) 24px max(16px, env(safe-area-inset-left, 0px));overflow:auto";
    const caixa = document.createElement("div"); caixa.setAttribute("role", "dialog"); caixa.setAttribute("aria-modal", "true");
    caixa.style.cssText = "font-family:system-ui,-apple-system,'Segoe UI',sans-serif;background:var(--surface-1);color:var(--text-primary);border:1px solid var(--border);border-radius:12px;padding:16px;max-width:1000px;width:100%";
    const cab = document.createElement("div"); cab.style.cssText = "display:flex;justify-content:space-between;gap:12px;align-items:start";
    const h = document.createElement("h2"); h.textContent = titulo; h.style.cssText = "margin:0;font-size:17px";
    const fechar = document.createElement("button"); fechar.type = "button"; fechar.textContent = "Fechar"; fechar.className = "limpar"; fechar.onclick = () => { fundo.remove(); document.body.classList.remove("com-relatorio"); };
    cab.append(h, fechar);
    const p = document.createElement("p"); p.textContent = motivo; p.style.cssText = "font-size:14px;color:var(--text-primary);margin:8px 0 12px;padding:8px 10px;border:1px solid var(--border);border-left:4px solid var(--accent);border-radius:6px;background:var(--page)";
    caixa.append(cab, p);
    if (repetir) {
      const b = document.createElement("button"); b.type = "button"; b.className = "limpar"; b.textContent = "⬇ Tentar baixar novamente"; b.style.marginBottom = "12px";
      b.onclick = () => repetir().catch((e) => { p.textContent = "O claude.ai não concluiu o download (" + ((e && (e.code || e.message)) || "erro") + "). Use as opções abaixo."; });
      caixa.append(b);
    }
    if (abas) {
      const lista = document.createElement("div"); lista.style.cssText = "display:flex;flex-wrap:wrap;gap:8px";
      for (const [nome, linhas] of abas) {
        const b = document.createElement("button"); b.type = "button"; b.className = "limpar"; b.textContent = "Copiar “" + nome + "” (" + Math.max(0, linhas.length - 1) + " linhas)";
        b.onclick = () => copiarTexto(paraTSV(linhas), "“" + nome + "”");
        lista.append(b);
      }
      const ta = document.createElement("textarea"); ta.id = "alt-texto"; ta.hidden = true; ta.readOnly = true; ta.style.cssText = "width:100%;height:160px;margin-top:10px;font:12px monospace";
      caixa.append(lista, ta);
    }
    if (html) {
      // O relatório é sempre claro: dentro de um Shadow DOM isolado, com cores próprias (não herda o tema escuro do painel)
      const hospede = document.createElement("div"); hospede.style.cssText = "border:1px solid var(--border);border-radius:8px;overflow:hidden;background:#ffffff;color-scheme:light";
      const sombra = hospede.attachShadow({ mode: "open" });
      const doc = new DOMParser().parseFromString(html, "text/html");
      doc.querySelectorAll("script, .barra").forEach((x) => x.remove());
      const estilos = [...doc.querySelectorAll("style")].map((x) => x.textContent.replace(/:root\s*\{/g, ":host{").replace(/(^|[}\s])body\s*\{/g, "$1.doc{")).join("\n");
      sombra.innerHTML = "<style>:host{all:initial;display:block;color-scheme:light} .doc{display:block;background:#ffffff;color:#0b0b0b;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;line-height:1.45}" + estilos + "</style><div class=\"doc\">" + doc.body.innerHTML + "</div>";
      // Impressão: só o relatório, inteiro (sem a janela fixa com rolagem, que cortava nas primeiras folhas)
      const imp = document.createElement("button"); imp.type = "button"; imp.className = "limpar"; imp.textContent = "🖨 Imprimir relatório / salvar em PDF"; imp.style.margin = "0 0 12px";
      imp.onclick = () => window.print();
      caixa.append(imp);
      caixa.append(hospede);
      fundo.classList.add("com-relatorio"); document.body.classList.add("com-relatorio");
      if (!document.getElementById("alt-print")) {
        const st = document.createElement("style"); st.id = "alt-print";
        st.textContent = "@media print{body.com-relatorio > *:not(#alt-fundo){display:none !important}" +
          "#alt-fundo.com-relatorio{position:static !important;inset:auto !important;overflow:visible !important;background:none !important;padding:0 !important;display:block !important}" +
          "#alt-fundo.com-relatorio > div{border:0 !important;padding:0 !important;max-width:none !important;box-shadow:none !important}" +
          "#alt-fundo.com-relatorio > div > :not(div[data-relatorio]){display:none !important}" +
          "#alt-fundo.com-relatorio div[data-relatorio]{border:0 !important;overflow:visible !important}" +
          "html,body{height:auto !important;overflow:visible !important;background:#fff !important}}";
        document.head.append(st);
      }
      hospede.setAttribute("data-relatorio", "");
    }
    fundo.append(caixa);
    fundo.addEventListener("click", (e) => { if (e.target === fundo) { fundo.remove(); document.body.classList.remove("com-relatorio"); } });
    document.body.append(fundo);
    fechar.focus();
  }
  async function salvarArquivo(nome, blob, alternativa) {
    const alt = alternativa || {};
    const dl = await DL_PROMESSA;
    if (dl) {
      try { await dl.save({ filename: nome, data: blob }); return; }
      catch (e) {
        if (e && e.code === "declined") return;
        janelaAlternativa(alt.titulo || "Não foi possível salvar o arquivo", "O claude.ai não concluiu o download (" + ((e && (e.code || e.message)) || "erro") + ")." + (alt.abas ? " Tente de novo ou copie os dados abaixo e cole no Excel ou no Google Sheets." : " Tente de novo ou veja o relatório abaixo."), alt.abas, alt.html, () => dl.save({ filename: nome, data: blob }));
        return;
      }
    }
    if (NO_CLAUDE) {   // dentro do claude.ai sem a capacidade: o download comum seria bloqueado sem aviso
      janelaAlternativa(alt.titulo || "Download indisponível", "Nesta visualização o claude.ai não permite baixar arquivos (por exemplo, para quem abre sem conta ou fora da organização)." + (alt.abas ? " Copie os dados abaixo e cole no Excel ou no Google Sheets." : ""), alt.abas, alt.html);
      return;
    }
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  // Relatório em HTML: no claude.ai é salvo para abrir e imprimir (ou mostrado na tela, se o download não estiver disponível);
  // no arquivo local abre em nova aba
  async function abrirRelatorio(nome, html) {
    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    if (NO_CLAUDE) {
      if (await DL_PROMESSA) avisar("Confirme o download; depois abra o arquivo e use Imprimir / salvar em PDF.");
      return salvarArquivo(nome, blob, { titulo: "Relatório", html });
    }
    const w = window.open(URL.createObjectURL(blob), "_blank");
    if (!w) return salvarArquivo(nome, blob, { titulo: "Relatório", html });
  }


  // ---------- Seleção ----------
  const cods = Object.keys(D.mun).sort((a, b) => D.mun[a].n.localeCompare(D.mun[b].n, "pt-BR"));
  const estado = { uf: "MA", cod: null };
  function preencherMunicipios() {
    const s = $("f-mun"); s.textContent = "";
    for (const c of cods) if (D.mun[c].uf === estado.uf) s.append(el("option", { value: c }, D.mun[c].n));
    if (!estado.cod || D.mun[estado.cod].uf !== estado.uf) estado.cod = s.options[0].value;
    s.value = estado.cod;
  }
  const marcarUf = () => { for (const b of document.querySelectorAll("#f-uf button")) b.setAttribute("aria-pressed", String(b.dataset.uf === estado.uf)); };
  for (const b of document.querySelectorAll("#f-uf button")) b.onclick = () => { if (estado.uf === b.dataset.uf) return; estado.uf = b.dataset.uf; estado.cod = null; marcarUf(); preencherMunicipios(); irPara(estado.cod); };
  $("f-mun").addEventListener("change", (e) => irPara(e.target.value));
  function irPara(c) { estado.cod = c; try { history.replaceState(null, "", "#m" + c); } catch (e) {} render(); }

  // ---------- Desenho ----------
  function render() {
    const m = D.mun[estado.cod];
    $("m-nome").textContent = m.n + " (" + UF_NOME[m.uf] + ")";
    $("m-sit").textContent = ""; $("m-sit").append(chip(sitMunicipio(m)));
    const regs = D.entregas.map((e, i) => registro(m, i));
    const cont = {}; for (const r of regs) cont[r.cor] = (cont[r.cor] || 0) + 1;
    const lg = $("m-legenda"); lg.textContent = "";
    for (const c of ORDEM) lg.append(el("div", { class: "leg", style: `--cor:var(--c-${c})` }, el("div", { class: "n" }, cont[c] || 0), el("div", { class: "t" }, COR[c].nome), el("div", { class: "d" }, COR[c].d)));

    const lp = $("l-proximas"); lp.textContent = "";
    $("n-proximas").textContent = JANELAS.length ? "Atividades que vencem nas duas próximas datas de entrega, organizadas por data. Em azul-claro, as que ainda não têm nenhum dado; a janela avança sozinha quando um prazo passa." : "Não há entregas a vencer.";
    for (const iso of JANELAS) {
      const d = dias(iso);
      lp.append(el("div", { class: "grupo-data" }, "Até " + fmtData(iso), el("span", { class: "dias" }, d === 0 ? "vence hoje" : "faltam " + d + " dias")));
      for (const i of D.entregas.map((e, k) => k).filter((k) => D.entregas[k].iso === iso)) lp.append(linhaEntrega(m, i, true));
    }
    const ab = $("l-areas"); const abertas = new Set([...ab.querySelectorAll("details.area[open]")].map((d) => d.dataset.area)); ab.textContent = "";
    for (const a of D.areas) {
      const idxs = D.entregas.map((e, i) => i).filter((i) => D.entregas[i].area === a.id);
      if (!idxs.length) continue;
      const s = m.s[a.id];
      const faixa = el("span", { class: "faixa", "aria-hidden": "true" }, ...idxs.map((i) => el("i", { style: `--cor:var(--c-${regs[i].cor})`, title: D.entregas[i].nome + " — " + COR[regs[i].cor].nome + " · prazo " + fmtData(D.entregas[i].iso) })));
      const c2 = {}; for (const i of idxs) c2[regs[i].cor] = (c2[regs[i].cor] || 0) + 1;
      const resumo = ORDEM.filter((c) => c2[c]).map((c) => c2[c] + " " + COR[c].nome.toLowerCase()).join(" · ");
      const det = el("details", { class: "area", "data-area": a.id },
        el("summary", null,
          el("span", { class: "seta", "aria-hidden": "true" }, "›"),
          el("span", { class: "a-nome" }, el("strong", null, a.id), " — " + a.nome, el("small", null, idxs.length + " atividades · " + resumo)),
          s ? chip(sitArea(s, a.id)) : el("span"),
          faixa));
      const corpo = el("div", { class: "a-corpo" });
      for (const i of idxs) corpo.append(linhaEntrega(m, i));
      det.append(corpo);
      if (abertas.has(a.id)) det.open = true;
      ab.append(det);
    }
  }

  // ---------- Partes fixas ----------
  $("titulo").textContent = D.meta.titulo;
  $("subtitulo").textContent = D.meta.subtitulo;
  for (const t of [D.meta.aviso, "Referência: " + D.meta.data_ref, "Gerado em " + D.meta.gerado_em]) $("meta").append(el("span", null, t));
  const nav = $("navegacao");
  for (const [rot, href] of [["Cronograma de entregas (site do Selo) ↗", D.meta.cronograma], ["Guia Metodológico v3 (PDF) ↗", D.meta.guia_pdf], ["Notícias do Selo ↗", D.meta.noticias_url]]) nav.append(el("a", { href, target: "_blank", rel: "noopener" }, rot));
  const tema = el("button", { type: "button", class: "tema", id: "b-tema" }); nav.append(tema);
  (function () {
    const NOMES = { auto: "Automático", light: "Claro", dark: "Escuro" }, ORD = ["auto", "light", "dark"];
    let t = "auto"; try { t = localStorage.getItem("selo-tema") || "auto"; } catch (e) {}
    const aplicar = () => { if (t === "auto") document.documentElement.removeAttribute("data-theme"); else document.documentElement.setAttribute("data-theme", t); tema.textContent = "◐ Tema: " + NOMES[t]; };
    tema.onclick = () => { t = ORD[(ORD.indexOf(t) + 1) % 3]; try { localStorage.setItem("selo-tema", t); } catch (e) {} aplicar(); };
    aplicar();
  })();
  $("rodape").textContent = D.meta.rodape;

  // Início: município do endereço (#m<código IBGE>) ou o primeiro do Maranhão
  const doHash = /^#m(\d{7})$/.exec(location.hash || "");
  if (doHash && D.mun[doHash[1]]) { estado.cod = doHash[1]; estado.uf = D.mun[estado.cod].uf; }
  marcarUf(); preencherMunicipios(); render();
  window.addEventListener("hashchange", () => { const h = /^#m(\d{7})$/.exec(location.hash); if (h && D.mun[h[1]] && h[1] !== estado.cod) { estado.cod = h[1]; estado.uf = D.mun[h[1]].uf; marcarUf(); preencherMunicipios(); render(); } });
})();
