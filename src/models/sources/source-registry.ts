import type { SourceDocument } from '@models/database/schemas'
import { GenericJsonAdapter } from '@models/sources/generic-json-adapter'
import { HtmlSelectorsAdapter } from '@models/sources/html-selectors-adapter'
import type { SourceAdapter } from '@models/sources/source-adapter'

const genericJsonAdapter = new GenericJsonAdapter()
const htmlSelectorsAdapter = new HtmlSelectorsAdapter()

export function sourceAdapterFor(source: SourceDocument): SourceAdapter {
  switch (source.adapter.type) {
    case 'generic-json':
      return genericJsonAdapter
    case 'html-selectors':
      return htmlSelectorsAdapter
  }
}
