import ts from 'typescript';

/** Only summarize a props-free page with one default export and no module side effects. */
export function replacementPageContract(source: string): string | undefined {
  const file = ts.createSourceFile(
    'page.tsx',
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const components = new Map<
    string,
    ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression
  >();
  let target:
    ts.FunctionDeclaration | ts.ArrowFunction | ts.FunctionExpression | string | undefined;
  const constantData = (node: ts.Node): boolean => {
    if (
      ts.isLiteralExpression(node) ||
      [ts.SyntaxKind.TrueKeyword, ts.SyntaxKind.FalseKeyword, ts.SyntaxKind.NullKeyword].includes(
        node.kind,
      )
    )
      return true;
    if (ts.isArrayLiteralExpression(node)) return node.elements.every(constantData);
    if (ts.isObjectLiteralExpression(node))
      return node.properties.every(
        (property) =>
          ts.isPropertyAssignment(property) &&
          !ts.isComputedPropertyName(property.name) &&
          constantData(property.initializer),
      );
    if (
      ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node)
    )
      return constantData(node.expression);
    if (
      ts.isPrefixUnaryExpression(node) &&
      [ts.SyntaxKind.PlusToken, ts.SyntaxKind.MinusToken].includes(node.operator)
    )
      return constantData(node.operand);
    return false;
  };

  for (const node of file.statements) {
    if (ts.isImportDeclaration(node)) {
      if (
        !node.importClause ||
        !ts.isStringLiteral(node.moduleSpecifier) ||
        node.moduleSpecifier.text !== 'react'
      )
        return undefined;
    } else if (ts.isFunctionDeclaration(node)) {
      if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) {
        if (!node.modifiers.some((m) => m.kind === ts.SyntaxKind.DefaultKeyword) || target)
          return undefined;
        target = node;
      }
      if (node.name) components.set(node.name.text, node);
    } else if (ts.isVariableStatement(node)) {
      if (node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) return undefined;
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name) || !declaration.initializer) return undefined;
        const value = declaration.initializer;
        if (ts.isArrowFunction(value) || ts.isFunctionExpression(value))
          components.set(declaration.name.text, value);
        else if (!constantData(value)) return undefined;
      }
    } else if (ts.isExportAssignment(node) && !node.isExportEquals && !target) {
      const value = node.expression;
      if (ts.isIdentifier(value)) target = value.text;
      else if (ts.isArrowFunction(value) || ts.isFunctionExpression(value)) target = value;
      else return undefined;
    } else return undefined;
  }
  const component = typeof target === 'string' ? components.get(target) : target;
  if (
    !component ||
    component.parameters.length ||
    component.typeParameters?.length ||
    component.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
  )
    return undefined;
  return 'The fully inspected file is a props-free React page with exactly one default component export. It has no other exported API or module-level side effects. The current request replaces its page implementation. Preserve a default React component export; implement the new page from scratch.';
}
