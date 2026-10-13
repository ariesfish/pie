// Ported from getpaseo/paseo (Apache-2.0)
export interface MarkdownAstNodeWithChildren {
  type: string;
  children: MarkdownAstNodeWithChildren[];
}

export function markdownNodeContainsType(node: MarkdownAstNodeWithChildren, type: string): boolean {
  if (node.type === type) {
    return true;
  }

  return node.children.some((child) => markdownNodeContainsType(child, type));
}
