# Builds the program on native Windows.
#
# Two settings differ from Anchor 1.2.0's defaults:
#   --tools-version v1.54   cargo-build-sbf 4.1.0 crashes on Windows for any
#                           platform-tools version other than its built-in one.
#   ANCHOR_BUILD_SBF_ARCH   v1.54 emits an SBPF v3 binary that LiteSVM 0.10
#                           rejects, so build the classic v0 format instead.
$env:ANCHOR_BUILD_SBF_ARCH = "v0"
anchor build --tools-version v1.54 @args
exit $LASTEXITCODE
