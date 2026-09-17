# Bookshelf Reader

Bookshelf Reader is a local-first reader that normalizes publications from user-installed third-party sources into a consistent library and reading experience.

## Content

**Publication**:
A readable work supplied by one source. Its kind is book, article, or comic.
_Avoid_: Book as an umbrella term, content item

**Chapter**:
The smallest independently readable and downloadable part of a publication. A publication without natural chapters has one synthetic chapter.
_Avoid_: Section, episode

**Resource**:
An ordered text, HTML, image, or external-link item belonging to a chapter.
_Avoid_: Asset when referring to reader content

**Chapter revision**:
A source-observable version of a chapter's resources. Replacing a downloaded revision is an explicit user action.

## Sources

**Source**:
A user-installed provider of publications. A source owns the identities and ordering of its publications and chapters.
_Avoid_: Repository, feed

**Source definition**:
A versioned, declarative description of how to retrieve and normalize one source. It contains no executable user code.
_Avoid_: Plugin, script

**Catalog list**:
A source-defined, ordered collection used to discover publications, such as latest, popular, completed, or a genre.
_Avoid_: Category as the general term

## Local library

**Local Library**:
The union of publications retained through a publication bookmark, reading history, or cached chapter.

**Publication bookmark**:
An explicit request to keep a publication in the Bookmarks list. It is not a marker inside reader content.
_Avoid_: Favorite, in-content bookmark

**Reading history**:
A recency list of the last 30 publications whose reader pages were entered. Removing an entry does not remove progress or cached content.
_Avoid_: Progress

**Reading progress**:
A publication's single current resume position, expressed as a content-based locator. It is independent of history, bookmarks, and cached content.
_Avoid_: Reading history

**Download**:
A user-requested operation that makes an entire chapter available offline. It can continue while the user navigates elsewhere in the active app.

**Read-through cache**:
Content persisted because it was displayed or prefetched around the reader viewport, without an explicit whole-chapter download request.

**Available offline**:
A chapter whose required reader resources are present locally. A partially cached chapter is available only up to its cached boundary.
