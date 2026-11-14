#!/usr/bin/env bats
# .generated/compose.yaml: one include entry per deploy/compose file + its dev overlay, env_file always explicit.

setup() {
  load 'helpers/test-helper'
  load_bats_libs
  setup_sandbox
}

expected() {
  sed -e "s|@BE@|$KMAEDU_BE_DIR|g" -e "s|@DEV@|$DEV_ROOT|g" -e "s|@GEN@|$GEN|g" \
    -e "s|^name: kmaedu-dev$|name: ${KMAEDU_DEV_PROJECT:-kmaedu-dev}|" "$DEV_ROOT/test/fixtures/expected/compose.yaml"
}

@test "compose.yaml matches the golden file" {
  run "$PROJECT" render
  assert_success
  diff -u <(expected) "$GEN/compose.yaml"
}

@test "the project name follows KMAEDU_DEV_PROJECT" {
  KMAEDU_DEV_PROJECT=kmaedu-dev-alt "$PROJECT" render
  grep -qx 'name: kmaedu-dev-alt' "$GEN/compose.yaml"
}

@test "every include entry carries project_directory and env_file" {
  "$PROJECT" render
  entries="$(grep -c '^  - path:' "$GEN/compose.yaml")"
  [ "$entries" = "$(grep -c '^    project_directory: ' "$GEN/compose.yaml")" ]
  [ "$entries" = "$(grep -c "^    env_file: \"$GEN/compose.env\"$" "$GEN/compose.yaml")" ]
  [ "$entries" -ge 14 ]
}

@test "a deploy compose file without a dev overlay dies, naming both files" {
  copy_be
  cp "$BE_COPY/deploy/compose/r2.yml" "$BE_COPY/deploy/compose/newsvc.yml"
  printf '    - path: compose/newsvc.yml\n      project_directory: .\n' >>"$BE_COPY/deploy/docker-compose.yml"
  run "$PROJECT" render
  assert_failure
  assert_output --partial "compose/newsvc.yml"
  assert_output --partial "compose/newsvc.dev.yaml"
  [ ! -e "$GEN/compose.yaml" ]
}

@test "a path with a double quote or a dollar sign dies" {
  export KMAEDU_DEV_GEN_DIR="$SANDBOX/ge\$n"
  run "$PROJECT" render
  assert_failure
  assert_output --partial "unsupported character"
  export KMAEDU_DEV_GEN_DIR="$SANDBOX/ge\"n"
  run "$PROJECT" render
  assert_failure
  assert_output --partial "unsupported character"
}

@test "two renders: secrets.env identical, every other file stable" {
  "$PROJECT" render
  before="$(cd "$GEN" && find . -type f | sort | xargs sha256sum)"
  "$PROJECT" render
  after="$(cd "$GEN" && find . -type f | sort | xargs sha256sum)"
  [ "$before" = "$after" ]
}
