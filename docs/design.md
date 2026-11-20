# Design

The parts every language shares: the command line, the walk, the worker
processes and how a file reaches its formatter. Each language's own
pipeline is on its page: [C++](cpp.md), [the others](languages.md).

## The command line and the walk

`src/main.ts` parses the arguments, walks the paths it is given and picks
each file's language from its name (`isCppName`, `isJavaName` and the rest,
one per `src/<lang>/run.ts`). A directory is walked recursively, skipping
hidden entries and symbolic links and honouring basic `.gitignore` patterns
(names, `dir/`, `/name`, `*.ext`). Each entry is `lstat`ed, so a link is never
followed: one to an ancestor would walk the tree forever, and one to a file in
the tree would format it twice. A path named on the command line is followed
whatever it is. A directory named like a source (`Directory.swift`) is walked
in place; should an entry become a directory after the walk, a worker logs it
as one and the parent walks it then.

## Workers

Nish refuses file I/O inside threads, so the parent writes one file list and
spawns itself as `nishfmt --worker` once per core (once in all for stdout,
or for fewer than 64 files). The parent never formats a file itself. Workers
claim chunks of the list by creating the chunk's marker file exclusively;
chunks shrink to single files near the end so no worker finishes long after
the others. Each worker appends a line to its own progress log as soon as it
finishes an entry of the list: the entry's index and what it added to the
counts. The parent sums the logs into the summary line. An entry that turns
out to be a directory (one named like a source) is logged as one, and the
parent walks it and formats its files in a round of workers of their own.

## A worker that dies

A formatter that panics (a bounds check, an overflow) or a worker killed by
a signal takes down that worker only. The parent starts a replacement
straight away while chunks are left unclaimed, and once every worker has
exited it looks for entries with no line in any log:

- In a chunk that was claimed, the first unfinished entry is the one its
  worker died on, since a worker formats a chunk in order. It is run again
  in a worker of its own, so a crash that was not the file's doing (its
  worker killed from outside, say) does not get it skipped.
- The other unfinished entries go to a fresh round of workers, which
  recovers the same way.
- A file that its own worker dies on too is left untouched (with no mode,
  printed as it is), reported as `nishfmt: skipped <path> (formatter
  crashed)` even under `-q`, and counted as skipped; the summary says how
  many of the skipped crashed.

A crashed file is a skipped file: the run's exit status is the one it would
have had if the formatter had answered `false` for that file, 0, or 1 under
`--check` when another file would change. One file nishfmt cannot handle
does not fail a run, whether its formatter gives up or crashes. The panic's
own message is on stderr, and the `formatter crashed` line names the file
for a bug report.

When there can be no workers, because the list cannot be written (`TMPDIR`
is not writable) or no worker process will start, the parent formats the
files itself, as it did for few files before, and a panic then ends the run.

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
   design, with its list files, re-exec and progress logs. Threads would remove
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
