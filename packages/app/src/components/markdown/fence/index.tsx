// Ported from getpaseo/paseo (Apache-2.0)
import type { ComponentType } from "react";
import { HighlightedCodeBlock } from "@/components/highlighted-code-block";
import { getMarkdownFenceLanguage } from "./language";
import type { MarkdownFenceRendererProps } from "./types";

export interface MarkdownFenceBlockProps extends MarkdownFenceRendererProps {
  info: string | null | undefined;
}

import { MermaidFence } from "./mermaid";

const diagramFences: Partial<Record<string, ComponentType<MarkdownFenceRendererProps>>> = {
	// [pie] mermaid runs through beautiful-mermaid (MIT, DOM-free) instead of
	// paseo's iframe runtime; see fence/mermaid/index.tsx.
	mermaid: MermaidFence,
};

export function MarkdownFenceBlock({
  code,
  info,
  phase,
  inheritedStyles,
  textStyle,
}: MarkdownFenceBlockProps) {
  const language = getMarkdownFenceLanguage(info);
  const DiagramFence = language ? diagramFences[language] : undefined;
  if (DiagramFence) {
    return (
      <DiagramFence
        code={code}
        phase={phase}
        inheritedStyles={inheritedStyles}
        textStyle={textStyle}
      />
    );
  }
  return (
    <HighlightedCodeBlock
      code={code}
      language={language}
      inheritedStyles={inheritedStyles}
      textStyle={textStyle}
    />
  );
}
