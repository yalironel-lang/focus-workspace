import type { AtmosphereTokens } from '../../hooks/useAtmosphere';
import type { CustomBlock, BlockContent } from '../../hooks/useCustomBlocks';
import { TextBlock }      from '../workspace/blocks/TextBlock';
import { QuoteBlock }     from '../workspace/blocks/QuoteBlock';
import { ImageBlock }     from '../workspace/blocks/ImageBlock';
import { LinkBlock }      from '../workspace/blocks/LinkBlock';
import { ChecklistBlock } from '../workspace/blocks/ChecklistBlock';
import { DividerBlock }   from '../workspace/blocks/DividerBlock';
import { EmojiBlock }     from '../workspace/blocks/EmojiBlock';
import { NoteBlock }      from '../workspace/blocks/NoteBlock';

interface Props {
  block:    CustomBlock;
  tokens:   AtmosphereTokens;
  onChange: (content: BlockContent) => void;
}

export function BlockRenderer({ block, tokens, onChange }: Props) {
  const { content } = block;

  switch (content.type) {
    case 'text':
      return (
        <TextBlock
          content={content}
          tokens={tokens}
          onChange={c => onChange(c)}
        />
      );
    case 'quote':
      return (
        <QuoteBlock
          content={content}
          tokens={tokens}
          onChange={c => onChange(c)}
        />
      );
    case 'image':
      return (
        <ImageBlock
          content={content}
          tokens={tokens}
          onChange={c => onChange(c)}
        />
      );
    case 'link':
      return (
        <LinkBlock
          content={content}
          tokens={tokens}
          onChange={c => onChange(c)}
        />
      );
    case 'checklist':
      return (
        <ChecklistBlock
          content={content}
          tokens={tokens}
          onChange={c => onChange(c)}
        />
      );
    case 'divider':
      return (
        <DividerBlock
          content={content}
          tokens={tokens}
          onChange={c => onChange(c)}
        />
      );
    case 'emoji':
      return (
        <EmojiBlock
          content={content}
          tokens={tokens}
          onChange={c => onChange(c)}
        />
      );
    case 'note':
      return (
        <NoteBlock
          content={content}
          tokens={tokens}
          onChange={c => onChange(c)}
        />
      );
    default:
      return null;
  }
}
