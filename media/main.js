const input = document.getElementById('gpt-input');

const vscode = acquireVsCodeApi();

input.scrollIntoView();
input.focus();

input.addEventListener('keydown', function (e) {
  if (e.key === 'Enter') {
    if (e.shiftKey) {
      let start = this.selectionStart;
      let end = this.selectionEnd;

      let value = this.value;
      this.value = value.substring(0, start) + '\n' + value.substring(end);

      this.selectionStart = this.selectionEnd = start + 1;
    } else {
      vscode.postMessage({ type: 'submitMessage', value: input.value });
      input.value = '';
    }
    e.preventDefault();
  }

  if (e.key === '{') {
    const start = input.selectionStart + 1;
    input.value = splice(input.value, input.selectionStart, 0, '{}');
    input.selectionStart = start;
    input.selectionEnd = start;
    e.preventDefault();
  }
});

function splice(source, start, delCount, newSubStr) {
  return (
    source.slice(0, start) +
    newSubStr +
    source.slice(start + Math.abs(delCount))
  );
}
