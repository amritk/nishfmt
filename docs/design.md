# Design

The parts every language shares: the command line, the walk, the worker
processes and how a file reaches its formatter. Each language's own
pipeline is on its page: [C++](cpp.md), [the others](languages.md).

## The command line and the walk

`src/main.ts` parses the arguments, walks the paths it is given and picks
each file's language from its name (`isCppName`, `isJavaName` and the rest,
one per `src/<lang>/run.ts`). A directory is walked recursively, skipping
hidden entries and honouring basic `.gitignore` patterns (names, `dir/`,
`/name`, `*.ext`). A name that looks like a source is not stat'ed during the
walk; if it turns out to be a directory, the worker walks it then.

## Workers

Nish refuses file I/O inside threads, so the parent writes one file list and
spawns itself as `nishfmt --worker` once per core. Workers claim chunks of
the list by creating the chunk's marker file exclusively; chunks shrink to
single files near the end so no worker finishes long after the others. Each
worker reports its counts through a stats file, which the parent sums into
the summary line.

## Regions and batches

C++ files are formatted one at a time by an engine each worker keeps. Every
other language formats in a Nish region (`regionWith`) that is freed after
the batch, so a worker's memory does not grow with the files it has
formatted. Java and Kotlin share one engine across a batch of up to 32 files
or 1 MB, so its arrays grow once rather than once a file; the other
languages take one file a batch. A formatter that cannot handle a file
answers `false`, and the file is left as it was and counted as skipped:
nishfmt never writes output it is not sure of.

## What Nish could add

A few features in Nish would make this faster or simpler:

1. **File I/O in `spawn`/`parallelMap` bodies.** Reading and writing a file
   inside a thread is refused today. That is what forces the multi-process
   design, with its list files, re-exec and stats files. Threads would remove
   about 100 lines and the process start-up cost.
2. **Escape analysis that follows fresh objects.** A parallel body that builds
   a fresh object is refused, even when that object never escapes the body:
   - an object whose constructor stores allocations into its fields;
   - an object built by calling methods on a fresh local.

   Accepting these would let each thread own its engine.
3. **The same analysis for `using arena()` scopes.** A function that builds
   an object graph inside an arena scope is refused with "stores an
   allocation into memory". With per-file arenas, the engine would not need
   hand-written `reset` methods to keep memory flat.
