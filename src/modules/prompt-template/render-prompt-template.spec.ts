import { compactRenderedPrompt, renderPromptTemplate } from './render-prompt-template';

describe('renderPromptTemplate', () => {
  it('replaces known variables and clears unknown placeholders', () => {
    const rendered = renderPromptTemplate('Hello {{name}}, room {{roomTitle}}', {
      name: 'Player',
    });
    expect(rendered).toBe('Hello Player, room ');
  });

  it('trims leading and trailing whitespace from rendered prompts', () => {
    const rendered = compactRenderedPrompt('  Line1\n\n\nLine2  ');
    expect(rendered).toBe('Line1\n\n\nLine2');
  });
});
