import assert from "node:assert/strict";
import test from "node:test";
import { refactorSource } from "./RefactoringEngine.js";

test("refactors Python with Python syntax and standard libraries", () => {
	const result = refactorSource("def parse(value):\n    return eval(value)\n");

	assert.equal(result.languageDetected, "Python");
	assert.match(result.enhancedCode, /import json/);
	assert.match(result.enhancedCode, /json\.loads\(value\)/);
	assert.doesNotMatch(
		result.enhancedCode,
		/JSON\.parse|const |let |console\.log/,
	);
	assert.notEqual(
		result.enhancedCode,
		"def parse(value):\n    return eval(value)\n",
	);
});

test("refactors TypeScript without changing its language", () => {
	const result = refactorSource(
		"export function parse(value: string): unknown {\n  return eval(value);\n}\n",
	);

	assert.equal(result.languageDetected, "TypeScript");
	assert.match(result.enhancedCode, /JSON\.parse\(value\)/);
	assert.doesNotMatch(result.enhancedCode, /json\.loads|def parse/);
	assert.equal(result.originalComplexity.functions, 1);
	assert.equal(result.enhancedComplexity.functions, 1);
});

test("fixes Python bare exceptions", () => {
	const result = refactorSource(
		"def load():\n    try:\n        return read()\n    except:\n        return None\n",
	);

	assert.equal(result.languageDetected, "Python");
	assert.match(result.enhancedCode, /except Exception:/);
	assert.doesNotMatch(result.enhancedCode, /^\s*except\s*:\s*$/m);
});

test("escapes React raw HTML in TypeScript", () => {
	const result = refactorSource(
		"interface Props { html: string }\nexport function View({ html }: Props) {\n  return <div dangerouslySetInnerHTML={{ __html: html }} />;\n}\n",
	);

	assert.equal(result.languageDetected, "TypeScript");
	assert.match(result.enhancedCode, /logicloomEscapeHtml/);
	assert.match(result.enhancedCode, /__html: logicloomEscapeHtml\(html\)/);
	assert.notEqual(
		result.enhancedCode,
		"interface Props { html: string }\nexport function View({ html }: Props) {\n  return <div dangerouslySetInnerHTML={{ __html: html }} />;\n}\n",
	);
});

test("flattens adjacent JavaScript guard conditions", () => {
	const source =
		"function run(user) {\n  if (user) {\n    if (user.active) {\n      return user.id;\n    }\n  }\n  return null;\n}\n";
	const result = refactorSource(source);

	assert.match(result.enhancedCode, /if \(user && user\.active\) \{/);
	assert.ok(
		result.enhancedComplexity.maximumNestingDepth <
			result.originalComplexity.maximumNestingDepth,
	);
});
