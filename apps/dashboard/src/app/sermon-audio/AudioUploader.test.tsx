import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { copy } from '@/copy/en';
import { expectNoA11yViolations } from '@/test/a11y';

import { AudioUploader } from './AudioUploader';
import type { MintResult } from './state';

/**
 * The uploader's state machine, with its two effectful seams faked: jsdom has neither
 * real audio decoding nor a real network, so the seams are the honest boundary
 * (~/.claude/standards/qa-testing.md: fake what the component talks to, never the
 * component). What stays real: the phases, the hidden-until-ready Save, the hidden
 * fields the save action reads, and the copy on every refusal.
 */

const PATH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.mp3';

function mintOk(): Promise<MintResult> {
  return Promise.resolve({
    ok: true,
    path: PATH,
    token: 'token',
    signedUrl: 'http://storage.test/upload',
  });
}

function mp3File(): File {
  return new File([new Uint8Array(2 * 1048576)], 'sunday-message.mp3', {
    type: 'audio/mpeg',
  });
}

function renderUploader(overrides: {
  mint?: () => Promise<MintResult>;
  readDuration?: (file: File) => Promise<number>;
  upload?: () => Promise<void>;
}) {
  return render(
    // A real form around it: Save reads useFormStatus from the form it belongs to.
    <form>
      <AudioUploader
        mint={overrides.mint ?? mintOk}
        submitLabel={copy.sermonAudio.attach.save}
        submittingLabel={copy.sermonAudio.attach.saving}
        seams={{
          readDuration: overrides.readDuration ?? (() => Promise.resolve(2520)),
          upload: overrides.upload ?? (() => Promise.resolve()),
        }}
      />
    </form>,
  );
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('no file input');
  return input;
}

describe('before a file is chosen', () => {
  test('there is no Save button at all: hidden, not disabled', async () => {
    const { container } = renderUploader({});

    expect(
      screen.getByText(copy.sermonAudio.attach.dropTitle),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: copy.sermonAudio.attach.save }),
    ).not.toBeInTheDocument();

    await expectNoA11yViolations(container);
  });
});

describe('a good file', () => {
  test('uploads, reads, and only then surfaces Save with the facts', async () => {
    const user = userEvent.setup();
    const { container } = renderUploader({});

    await user.upload(fileInput(), mp3File());

    // 2520 seconds is 42 minutes; the 2 MiB file reads as 2 MB.
    expect(
      await screen.findByText(copy.sermonAudio.attach.checkedTitle(42, 2)),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: copy.sermonAudio.attach.save }),
    ).toBeInTheDocument();

    // The two hidden fields the save action reads, exactly as minted and as read.
    expect(container.querySelector('input[name="path"]')).toHaveAttribute(
      'value',
      PATH,
    );
    expect(
      container.querySelector('input[name="durationSec"]'),
    ).toHaveAttribute('value', '2520');

    await expectNoA11yViolations(container);
  });

  test('Start over returns to the empty drop zone', async () => {
    const user = userEvent.setup();
    renderUploader({});

    await user.upload(fileInput(), mp3File());
    await screen.findByRole('button', { name: copy.sermonAudio.attach.save });

    await user.click(
      screen.getByRole('button', { name: copy.sermonAudio.attach.startOver }),
    );
    expect(
      screen.getByText(copy.sermonAudio.attach.dropTitle),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: copy.sermonAudio.attach.save }),
    ).not.toBeInTheDocument();
  });
});

describe('early refusals, before any upload', () => {
  test('a file that is not audio is refused without a mint', async () => {
    const mint = vi.fn(mintOk);
    renderUploader({ mint });

    // fireEvent rather than user.upload: userEvent honours the accept filter and would
    // silently drop the file, which is the browser picker's behaviour, not the drop
    // zone's. A drop can hand over anything.
    fireEvent.change(fileInput(), {
      target: {
        files: [new File(['plain'], 'notes.pdf', { type: 'application/pdf' })],
      },
    });

    expect(
      await screen.findByText(copy.sermonAudio.attach.pickNotAudio),
    ).toBeInTheDocument();
    expect(mint).not.toHaveBeenCalled();
  });

  test('an unreadable file is refused before the upload, not after it', async () => {
    const upload = vi.fn(() => Promise.resolve());
    renderUploader({
      readDuration: () => Promise.reject(new Error('undecodable')),
      upload,
    });

    fireEvent.change(fileInput(), { target: { files: [mp3File()] } });

    expect(
      await screen.findByText(copy.sermonAudio.attach.unreadable),
    ).toBeInTheDocument();
    expect(upload).not.toHaveBeenCalled();
  });
});

describe('an upload that dies', () => {
  test('says so, keeps nothing, and offers the drop zone again', async () => {
    const user = userEvent.setup();
    renderUploader({
      upload: () => Promise.reject(new Error('network gone')),
    });

    await user.upload(fileInput(), mp3File());

    expect(
      await screen.findByText(copy.sermonAudio.attach.uploadFailed),
    ).toBeInTheDocument();
    expect(
      screen.getByText(copy.sermonAudio.attach.dropTitle),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: copy.sermonAudio.attach.save }),
    ).not.toBeInTheDocument();
  });
});
