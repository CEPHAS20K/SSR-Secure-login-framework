function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export function renderRiskTrendChart({ chartNode, hintNode, series, rangeDays, onDrillDown }) {
  if (!chartNode) return;
  if (hintNode) {
    hintNode.textContent = `Last ${rangeDays} days • click points to drill into logs`;
  }
  if (!series?.length) {
    chartNode.innerHTML = "";
    return;
  }

  const width = 640;
  const height = 176;
  const paddingX = 36;
  const paddingTop = 16;
  const paddingBottom = 30;

  const maxScore = Math.max(100, ...series.map((item) => item.score));
  const stepX = (width - paddingX * 2) / Math.max(series.length - 1, 1);

  const points = series.map((item, index) => {
    const x = paddingX + stepX * index;
    const y =
      paddingTop + ((maxScore - item.score) / maxScore) * (height - paddingTop - paddingBottom);
    return { ...item, x, y };
  });

  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  const pointNodes = points
    .map(
      (point) =>
        `<circle cx="${point.x}" cy="${point.y}" r="4" fill="#ba274b" data-risk-index="${point.label}" style="cursor:pointer" />` +
        `<text x="${point.x}" y="${height - 8}" text-anchor="middle" font-size="10" fill="#7f1d1d">${escapeHtml(
          point.label
        )}</text>`
    )
    .join("");

  chartNode.setAttribute("viewBox", `0 0 ${width} ${height}`);
  chartNode.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" fill="rgba(255,255,255,0.55)" />
    <line x1="${paddingX}" y1="${height - paddingBottom}" x2="${width - paddingX}" y2="${height - paddingBottom}" stroke="rgba(127,29,29,0.35)" stroke-width="1" />
    <polyline fill="none" stroke="#ba274b" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" points="${polyline}" />
    ${pointNodes}
  `;

  chartNode.onclick = (event) => {
    const point = event.target.closest("circle[data-risk-index]");
    if (!point || typeof onDrillDown !== "function") return;
    onDrillDown(point.dataset.riskIndex || "");
  };
}

export function renderUserGrowthTrendChart({ chartNode, hintNode, series }) {
  if (!chartNode) return;
  if (hintNode) {
    hintNode.textContent = `Last ${series?.length || 0} months`;
  }
  if (!series?.length) {
    chartNode.innerHTML = "";
    return;
  }

  const width = 640;
  const height = 176;
  const paddingX = 36;
  const paddingTop = 16;
  const paddingBottom = 30;
  const plotHeight = height - paddingTop - paddingBottom;
  const maxTotal = Math.max(1, ...series.map((item) => item.totalUsers || 0));
  const maxNewUsers = Math.max(1, ...series.map((item) => item.newUsers || 0));
  const stepX = (width - paddingX * 2) / Math.max(series.length - 1, 1);

  const points = series.map((item, index) => {
    const x = paddingX + stepX * index;
    const y = paddingTop + ((maxTotal - (item.totalUsers || 0)) / maxTotal) * plotHeight;
    const barHeight = ((item.newUsers || 0) / maxNewUsers) * plotHeight;
    const barY = height - paddingBottom - barHeight;
    return { ...item, x, y, barY, barHeight };
  });

  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  const barNodes = points
    .map(
      (point) =>
        `<rect x="${point.x - 12}" y="${point.barY}" width="24" height="${point.barHeight}" rx="6" fill="rgba(186,39,75,0.24)" />`
    )
    .join("");
  const pointNodes = points
    .map(
      (point) =>
        `<circle cx="${point.x}" cy="${point.y}" r="4" fill="#7f1d1d" />` +
        `<text x="${point.x}" y="${height - 8}" text-anchor="middle" font-size="10" fill="#7f1d1d">${escapeHtml(
          point.label
        )}</text>`
    )
    .join("");

  chartNode.setAttribute("viewBox", `0 0 ${width} ${height}`);
  chartNode.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" fill="rgba(255,255,255,0.55)" />
    <line x1="${paddingX}" y1="${height - paddingBottom}" x2="${width - paddingX}" y2="${height - paddingBottom}" stroke="rgba(127,29,29,0.35)" stroke-width="1" />
    ${barNodes}
    <polyline fill="none" stroke="#7f1d1d" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${polyline}" />
    ${pointNodes}
  `;
}

export function renderTrafficTrendChart({ chartNode, series, onDrillDown }) {
  if (!chartNode) return;
  if (!series?.length) {
    chartNode.innerHTML = "";
    return;
  }

  const width = 640;
  const height = 124;
  const paddingX = 36;
  const paddingTop = 12;
  const paddingBottom = 24;
  const maxVisits = Math.max(1, ...series.map((item) => item.visits || 0));
  const stepX = (width - paddingX * 2) / Math.max(series.length - 1, 1);

  const points = series.map((item, index) => {
    const x = paddingX + stepX * index;
    const y =
      paddingTop +
      ((maxVisits - (item.visits || 0)) / maxVisits) * (height - paddingTop - paddingBottom);
    return { ...item, x, y };
  });

  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  const pointNodes = points
    .map(
      (point) =>
        `<circle cx="${point.x}" cy="${point.y}" r="3.5" fill="#ba274b" data-traffic-label="${point.label}" style="cursor:pointer" />` +
        `<text x="${point.x}" y="${height - 6}" text-anchor="middle" font-size="9" fill="#7f1d1d">${escapeHtml(
          point.label
        )}</text>`
    )
    .join("");

  chartNode.setAttribute("viewBox", `0 0 ${width} ${height}`);
  chartNode.innerHTML = `
    <rect x="0" y="0" width="${width}" height="${height}" fill="rgba(255,255,255,0.55)" />
    <line x1="${paddingX}" y1="${height - paddingBottom}" x2="${width - paddingX}" y2="${height - paddingBottom}" stroke="rgba(127,29,29,0.35)" stroke-width="1" />
    <polyline fill="none" stroke="#ba274b" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" points="${polyline}" />
    ${pointNodes}
  `;

  chartNode.onclick = (event) => {
    const point = event.target.closest("circle[data-traffic-label]");
    if (!point || typeof onDrillDown !== "function") return;
    onDrillDown(point.dataset.trafficLabel || "");
  };
}
