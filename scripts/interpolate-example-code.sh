#!/bin/bash

set -euo pipefail

# This script will modify the given files (all CLI arguments passed to the
# script are interpreted as filenames) to interpolate example code from files.
#
# It looks for lines that look like this:
#
# [This example code](../path/to/file.ts) shows how to do X.
#
# And replaces those occurrences to look like this:
#
# This example code shows how to do X.
#
# ```ts
# // Contents of ../path/to/file.ts
# ```
#
# This simple hack allows us to keep our code examples in separate files
# (which are runnable and testable in CI), while still including them inline in
# the documentation that gets published to npmjs.org for the packages.

for file in "${@}"; do
  echo "Interpolating example code in $file"

  IFS=''
  while read -r line; do
    if echo "$line" | grep -E '\[This example code\]\([^)]+\).+$' > /dev/null; then
      # If the line contains the pattern indicating a code example, fetch
      # the code and print it as a markdown code block.
      file_path=$(echo $line | cut -d '(' -f 2 | cut -d ')' -f 1)
      file_code=$(cat $file_path)

      # Print the line without the code link, followed by the code block.
      printf "This example code"; echo "$line" | cut -d ')' -f 2-
      echo # Empty line before the snippet
      echo '```ts'
      cat $file_path
      echo '```'
    else
      # For all lines which don't match the pattern, print them as-is.
      echo "$line"
    fi
  done < "$file" > "$file.tmp"
  mv "$file.tmp" "$file"

  git diff --color "$file" | cat
done