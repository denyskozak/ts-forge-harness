import ts from 'typescript';

/** An omission check, not proof of browser behavior. Imported helpers remain opaque. */
export function missingClipboardInteraction(source: string, prompt: string) {
  if (!/click[- ]to[- ]copy|clipboard|копир/iu.test(prompt)) return undefined;
  if (/\b(?:remove|disable)\b.{0,30}(?:clipboard|copy)|убери.{0,30}копир/iu.test(prompt))
    return undefined;
  const file = ts.createSourceFile(
    'page.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  if (
    file.statements.some(
      (node) =>
        ts.isImportDeclaration(node) &&
        (!ts.isStringLiteral(node.moduleSpecifier) || node.moduleSpecifier.text !== 'react'),
    )
  )
    return undefined;
  let writesClipboard = false;
  const buttons: ts.JsxElement[] = [];
  const walk = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
      const method = node.expression.name.text;
      if (
        method === 'writeText' ||
        (method === 'write' && /clipboard/.test(node.expression.expression.getText(file))) ||
        (method === 'execCommand' &&
          node.arguments.some((arg) => ts.isStringLiteral(arg) && arg.text === 'copy'))
      )
        writesClipboard = true;
    }
    if (ts.isJsxElement(node) && node.openingElement.tagName.getText(file) === 'button')
      buttons.push(node);
    ts.forEachChild(node, walk);
  };
  walk(file);
  if (writesClipboard) return undefined;
  const repeated = buttons.filter((button) => {
    for (let node: ts.Node | undefined = button.parent; node; node = node.parent)
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'map'
      )
        return true;
    return false;
  });
  const candidates = repeated.length
    ? repeated
    : buttons.filter((button) => /copy|копир/iu.test(button.getText(file)));
  const target =
    candidates.length === 1 ? candidates[0] : buttons.length === 1 ? buttons[0] : undefined;
  if (!target || target.getWidth(file) > 2000) return undefined;
  const oldText = target.getText(file);
  if (source.split(oldText).length !== 2) return undefined;
  return {
    oldText,
    startLine: file.getLineAndCharacterOfPosition(target.getStart(file)).line + 1,
    diagnostics:
      'The user requested click-to-copy, but this self-contained component has no clipboard write operation. Fix this item button so its onClick function calls navigator.clipboard.writeText with the displayed item content (the emoji string for an emoji gallery). Preserve the button label and other behavior. Return the complete corrected JSX button, not the surrounding file.',
    kind: 'interaction' as const,
  };
}
