# PDF symbol subset

`NotoSansSC-Symbols.otf` is a 3.4 KiB subset of the adjacent `NotoSansSC-Regular.otf`, under the same [SIL Open Font License](NotoSansSC-LICENSE.txt). It supplies arrows and the evaluation checkmark missing from the PDF renderer's Roboto font. Chinese documents already use the full Noto font; English documents load only this small subset when needed.

Reproduce with fontTools:

```sh
pyftsubset studio-public/fonts/NotoSansSC-Regular.otf --unicodes=U+2190-21FF,U+2713 --output-file=studio-public/fonts/NotoSansSC-Symbols.otf
```
