import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

/**
 * Only for deliberate architecture/format guards. Runtime behavior belongs in
 * renderHook/component/browser tests; normalizing EOL does not make text
 * matching an adequate substitute for those tests.
 */
export function readRepoSource(file: string): string {
  return readFileSync(resolve(file), "utf8").replace(/\r\n?/g, "\n");
}

/** An intentional import ownership boundary, insensitive to alias/whitespace. */
export function importedMemberCallCount(
  source: string, moduleName: string, importedName: string, member: string,
): number {
  const ast = ts.createSourceFile("contract.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const locals = new Set<string>();
  for (const statement of ast.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)
      || statement.moduleSpecifier.text !== moduleName) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const binding of bindings.elements) {
        if ((binding.propertyName ?? binding.name).text === importedName) locals.add(binding.name.text);
      }
    }
  }
  let count = 0;
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)
      && node.expression.name.text === member && ts.isIdentifier(node.expression.expression)
      && locals.has(node.expression.expression.text)) count += 1;
    ts.forEachChild(node, visit);
  };
  visit(ast);
  return count;
}
