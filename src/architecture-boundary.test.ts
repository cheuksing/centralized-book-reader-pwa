/// <reference types="node" />

import { readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as ts from 'typescript'
import { describe, expect, it } from 'vitest'

type Layer = 'app' | 'database' | 'external' | 'models' | 'react' | 'services' | 'view-models' | 'views' | 'zustand' | 'unknown'

type BoundaryViolation = {
  importer: string
  specifier: string
  reason: string
}

type ModuleReference = {
  specifier: string
  runtime: boolean
}

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const sourceRoot = resolve(projectRoot, 'src')


function normalisePath(filePath: string) {
  return filePath.replaceAll('\\', '/')
}

function layerForPath(filePath: string): Layer {
  const path = normalisePath(filePath)
  if (path.startsWith('src/app/')) return 'app'
  if (path.startsWith('src/models/database/')) return 'database'
  if (path.startsWith('src/models/')) return 'models'
  if (path.startsWith('src/services/')) return 'services'
  if (path.startsWith('src/view-models/')) return 'view-models'
  if (path.startsWith('src/views/')) return 'views'
  return 'unknown'
}

function dependencyLayer(importer: string, specifier: string): Layer {
  if (specifier.startsWith('@app/')) return 'app'
  if (specifier.startsWith('@models/database/')) return 'database'
  if (specifier.startsWith('@models/')) return 'models'
  if (specifier.startsWith('@services/')) return 'services'
  if (specifier.startsWith('@view-models/')) return 'view-models'
  if (specifier.startsWith('@view/')) return 'views'
  if (specifier === 'react' || specifier.startsWith('react/')) return 'react'
  if (specifier === 'react-dom' || specifier.startsWith('react-dom/')) return 'react'
  if (specifier === 'zustand' || specifier.startsWith('zustand/')) return 'zustand'
  if (specifier.startsWith('.')) {
    const target = normalisePath(relative(projectRoot, resolve(dirname(resolve(projectRoot, importer)), specifier)))
    return layerForPath(target)
  }
  return 'external'
}

function hasRuntimeBindings(clause: ts.ImportClause | undefined) {
  if (!clause || clause.isTypeOnly) return !clause?.isTypeOnly
  if (clause.name) return true
  if (!clause.namedBindings) return false
  if (ts.isNamespaceImport(clause.namedBindings)) return true
  return clause.namedBindings.elements.some((element) => !element.isTypeOnly)
}

function hasRuntimeExports(declaration: ts.ExportDeclaration) {
  if (declaration.isTypeOnly) return false
  if (!declaration.exportClause) return true
  if (ts.isNamespaceExport(declaration.exportClause)) return true
  return declaration.exportClause.elements.some((element) => !element.isTypeOnly)
}

function moduleReferences(source: string, filePath: string): ModuleReference[] {
  const scriptKind = filePath.endsWith('.tsx') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, scriptKind)
  const references: ModuleReference[] = []

  function visit(node: ts.Node) {
    if (ts.isImportDeclaration(node)) {
      if (ts.isStringLiteralLike(node.moduleSpecifier)) {
        references.push({ specifier: node.moduleSpecifier.text, runtime: hasRuntimeBindings(node.importClause) })
      }
      return
    }

    if (ts.isExportDeclaration(node)) {
      if (node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
        references.push({ specifier: node.moduleSpecifier.text, runtime: hasRuntimeExports(node) })
      }
      return
    }

    if (ts.isImportEqualsDeclaration(node)) {
      const reference = node.moduleReference
      if (ts.isExternalModuleReference(reference) && reference.expression && ts.isStringLiteralLike(reference.expression)) {
        references.push({ specifier: reference.expression.text, runtime: true })
      }
      return
    }

    if (ts.isCallExpression(node)) {
      const [argument] = node.arguments
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword && argument && ts.isStringLiteralLike(argument)) {
        references.push({ specifier: argument.text, runtime: true })
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require' && argument && ts.isStringLiteralLike(argument)) {
        references.push({ specifier: argument.text, runtime: true })
      }
    }

    ts.forEachChild(node, visit)
  }

  ts.forEachChild(sourceFile, visit)
  return references
}

function runtimeImports(source: string, filePath: string) {
  return moduleReferences(source, filePath).filter((reference) => reference.runtime).map((reference) => reference.specifier)
}

function findBoundaryViolation(importer: string, specifier: string, runtime = true): BoundaryViolation | undefined {
  const importerLayer = layerForPath(importer)
  const targetLayer = dependencyLayer(importer, specifier)

  if (runtime && importer.startsWith('src/views/pages/') && (targetLayer === 'services' || targetLayer === 'database')) {
    return {
      importer,
      specifier,
      reason: 'page views may depend on view models and models, not runtime services or database modules',
    }
  }

  if (importerLayer === 'services' && ['react', 'services', 'view-models', 'views', 'zustand'].includes(targetLayer)) {
    if (targetLayer !== 'services') {
      return {
        importer,
        specifier,
        reason: 'services must remain independent of React, Zustand, and view modules',
      }
    }
  }

  return undefined
}

function containsJsxSyntax(source: string, filePath: string) {
  const sourceFile = ts.createSourceFile(filePath, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  let found = false

  function visit(node: ts.Node) {
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node) || ts.isJsxFragment(node)) {
      found = true
      return
    }
    ts.forEachChild(node, visit)
  }

  ts.forEachChild(sourceFile, visit)
  return found
}

function serviceSyntaxViolation(importer: string, filePath: string, source: string): BoundaryViolation | undefined {
  if (layerForPath(importer) !== 'services') return undefined
  const isTsxFile = filePath.endsWith('.tsx')
  if (!isTsxFile && !containsJsxSyntax(source, filePath)) return undefined
  return {
    importer,
    specifier: isTsxFile ? '<tsx>' : '<jsx>',
    reason: 'services must not contain JSX or use .tsx files',
  }
}

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const nested = await Promise.all(entries.map(async (entry) => {
    const filePath = resolve(directory, entry.name)
    if (entry.isDirectory()) return sourceFiles(filePath)
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name) && !entry.name.endsWith('.check.ts') && !entry.name.endsWith('.test.ts') && !entry.name.endsWith('.spec.ts') && !entry.name.endsWith('.spec.tsx')) return [filePath]
    return []
  }))
  return nested.flat()
}

async function sourceBoundaryViolations(): Promise<BoundaryViolation[]> {
  const files = [
    ...(await sourceFiles(resolve(sourceRoot, 'views/pages'))),
    ...(await sourceFiles(resolve(sourceRoot, 'services'))),
  ]
  const violations: BoundaryViolation[] = []

  for (const filePath of files) {
    const importer = normalisePath(relative(projectRoot, filePath))
    const source = await readFile(filePath, 'utf8')
    const syntaxViolation = serviceSyntaxViolation(importer, filePath, source)
    if (syntaxViolation) violations.push(syntaxViolation)
    for (const reference of moduleReferences(source, filePath)) {
      const violation = findBoundaryViolation(importer, reference.specifier, reference.runtime)
      if (violation) violations.push(violation)
    }
  }

  return violations.sort((left, right) => `${left.importer}:${left.specifier}`.localeCompare(`${right.importer}:${right.specifier}`))
}

async function withTemporarySource(relativePath: string, source: string, callback: () => Promise<void>) {
  const filePath = resolve(projectRoot, relativePath)
  await writeFile(filePath, source, 'utf8')
  try {
    await callback()
  } finally {
    await rm(filePath, { force: true })
  }
}

describe('architecture import boundaries', () => {
  it('allows page-to-view-model and view-model-to-service dependency flow', () => {
    expect(findBoundaryViolation('src/views/pages/example-page.tsx', '@view-models/example')).toBeUndefined()
    expect(findBoundaryViolation('src/view-models/example.ts', '@services/example')).toBeUndefined()
    expect(findBoundaryViolation('src/services/example.ts', '@models/database/example')).toBeUndefined()
  })

  it('rejects runtime service, database, and reverse-layer imports', () => {
    expect(findBoundaryViolation('src/views/pages/example-page.tsx', '@services/example')).toMatchObject({
      importer: 'src/views/pages/example-page.tsx',
      specifier: '@services/example',
    })
    expect(findBoundaryViolation('src/views/pages/example-page.tsx', '@models/database/example')).toMatchObject({
      importer: 'src/views/pages/example-page.tsx',
      specifier: '@models/database/example',
    })
    expect(findBoundaryViolation('src/services/example.ts', '@view-models/example')).toMatchObject({
      importer: 'src/services/example.ts',
      specifier: '@view-models/example',
    })
  })

  it('rejects runtime page and service re-exports', () => {
    const pageExports = runtimeImports(
      "export { value } from '@services/example'\nexport * from '@models/database/example'",
      'src/views/pages/example-page.tsx',
    )
    expect(pageExports).toEqual(['@services/example', '@models/database/example'])
    expect(pageExports.map((specifier) => findBoundaryViolation('src/views/pages/example-page.tsx', specifier))).toEqual([
      expect.objectContaining({ specifier: '@services/example' }),
      expect.objectContaining({ specifier: '@models/database/example' }),
    ])

    const serviceExports = runtimeImports("export { value } from '@view-models/example'", 'src/services/example.ts')
    expect(serviceExports).toEqual(['@view-models/example'])
    expect(findBoundaryViolation('src/services/example.ts', serviceExports[0])).toMatchObject({
      importer: 'src/services/example.ts',
      specifier: '@view-models/example',
    })
    expect(runtimeImports("export type { Value } from '@view-models/example'", 'src/services/example.ts')).toEqual([])
  })

  it('rejects type-only service dependencies', async () => {
    await withTemporarySource(
      'src/services/architecture-boundary-type-import-fixture.ts',
      "import type { ExampleViewModel } from '@view-models/example'\nvoid ExampleViewModel",
      async () => {
        await expect(sourceBoundaryViolations()).resolves.toContainEqual({
          importer: 'src/services/architecture-boundary-type-import-fixture.ts',
          specifier: '@view-models/example',
          reason: 'services must remain independent of React, Zustand, and view modules',
        })
      },
    )
  })

  it('rejects service JSX and .tsx files', async () => {
    await withTemporarySource(
      'src/services/architecture-boundary-jsx-fixture.tsx',
      'export function Fixture() { return <div /> }',
      async () => {
        await expect(sourceBoundaryViolations()).resolves.toContainEqual({
          importer: 'src/services/architecture-boundary-jsx-fixture.tsx',
          specifier: '<tsx>',
          reason: 'services must not contain JSX or use .tsx files',
        })
      },
    )
    await withTemporarySource(
      'src/services/architecture-boundary-jsx-fixture.ts',
      'const element = <div />\nvoid element',
      async () => {
        await expect(sourceBoundaryViolations()).resolves.toContainEqual({
          importer: 'src/services/architecture-boundary-jsx-fixture.ts',
          specifier: '<jsx>',
          reason: 'services must not contain JSX or use .tsx files',
        })
      },
    )
  })

  it('keeps initialization retry reachable and mounts shared status regions', async () => {
    const appSource = await readFile(resolve(sourceRoot, 'app/app.tsx'), 'utf8')
    expect(appSource).toContain('Try again')
    expect(appSource).toContain('void initialize()')

    const homeSource = await readFile(resolve(sourceRoot, 'views/pages/home-page.tsx'), 'utf8')
    const sourcesSource = await readFile(resolve(sourceRoot, 'views/pages/sources-page.tsx'), 'utf8')
    expect(homeSource).not.toContain('{model.error && <StatusSlot')
    expect(sourcesSource).not.toContain('{!model.userScriptReady && <StatusSlot')
    expect(sourcesSource).not.toContain('{model.error && <StatusSlot')
    expect(sourcesSource).not.toContain('{model.browserError && <StatusSlot')
  })

  it('has no unapproved runtime boundary violations in production sources', async () => {
    await expect(sourceBoundaryViolations()).resolves.toEqual([])
  })
})
