const fs = require("node:fs");
const path = require("node:path");

const diagrams = require("../docs/diagrams/architecture-diagrams");

const ROOT_DIR = path.resolve(__dirname, "..");
const README_PATH = path.join(ROOT_DIR, "README.md");
const ARCH_DOC_PATH = path.join(ROOT_DIR, "docs", "architecture.md");

const README_START_MARKER = "<!-- BEGIN AUTO UML -->";
const README_END_MARKER = "<!-- END AUTO UML -->";

function buildClassDiagramSection() {
  return `### Class Diagram

\`\`\`mermaid
${diagrams.classDiagram}
\`\`\``;
}

function buildSequenceDiagramSection() {
  return `### Sequence Diagram

\`\`\`mermaid
${diagrams.sequenceDiagram}
\`\`\``;
}

function buildNotesSection() {
  const lines = diagrams.notes.map((note) => `- ${note}`);
  return `## Notes

${lines.join("\n")}`;
}

function buildArchitectureDoc() {
  return `# Architecture (Frontend + Backend)

${diagrams.intro}

## Class Diagram

\`\`\`mermaid
${diagrams.classDiagram}
\`\`\`

## Sequence Diagram

\`\`\`mermaid
${diagrams.sequenceDiagram}
\`\`\`

${buildNotesSection()}
`;
}

function buildReadmeSystemUmlSection() {
  return `## System UML

${buildClassDiagramSection()}

${buildSequenceDiagramSection()}`;
}

function replaceSystemUmlSection(readmeContent, sectionContent) {
  const generatedBlock = `${README_START_MARKER}\n${sectionContent}\n${README_END_MARKER}`;

  const hasMarkers =
    readmeContent.includes(README_START_MARKER) && readmeContent.includes(README_END_MARKER);
  if (hasMarkers) {
    const markerRegex = new RegExp(
      `${escapeRegExp(README_START_MARKER)}[\\s\\S]*?${escapeRegExp(README_END_MARKER)}`,
      "m"
    );
    return cleanupLegacyDiagramContent(readmeContent.replace(markerRegex, generatedBlock));
  }

  const systemUmlRegex = /## System UML[\s\S]*?(?=\n##\s|\n#\s|$)/m;
  if (systemUmlRegex.test(readmeContent)) {
    return cleanupLegacyDiagramContent(readmeContent.replace(systemUmlRegex, generatedBlock));
  }

  const architectureGuidesRegex =
    /(## Architecture Guides[\s\S]*?- System UML: `docs\/architecture\.md`[^\n]*\n)/m;
  if (architectureGuidesRegex.test(readmeContent)) {
    return cleanupLegacyDiagramContent(
      readmeContent.replace(architectureGuidesRegex, `$1\n${generatedBlock}\n`)
    );
  }

  return cleanupLegacyDiagramContent(`${readmeContent.trimEnd()}\n\n${generatedBlock}\n`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function writeFile(filePath, content) {
  fs.writeFileSync(filePath, content, "utf8");
  process.stdout.write(`[generate-uml] wrote ${path.relative(ROOT_DIR, filePath)}\n`);
}

function cleanupLegacyDiagramContent(content) {
  const endMarkerIndex = content.indexOf(README_END_MARKER);
  if (endMarkerIndex === -1) return content;

  const markerEnd = endMarkerIndex + README_END_MARKER.length;
  const nextSectionRelative = content.slice(markerEnd).search(/\n##\s|\n#\s/);
  if (nextSectionRelative === -1) return content;

  const nextSectionIndex = markerEnd + nextSectionRelative;
  const between = content.slice(markerEnd, nextSectionIndex);
  const hasLegacyMermaid =
    between.includes("```mermaid") ||
    between.includes("### Class Diagram") ||
    between.includes("### Sequence Diagram");

  if (!hasLegacyMermaid) return content;
  return `${content.slice(0, markerEnd)}\n${content.slice(nextSectionIndex + 1)}`;
}

function run() {
  const archDoc = buildArchitectureDoc();
  writeFile(ARCH_DOC_PATH, archDoc);

  const readme = fs.readFileSync(README_PATH, "utf8");
  const nextReadme = replaceSystemUmlSection(readme, buildReadmeSystemUmlSection());
  writeFile(README_PATH, nextReadme);
}

run();
