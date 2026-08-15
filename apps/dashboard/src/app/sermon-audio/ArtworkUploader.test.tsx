import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';

import { copy } from '@/copy/en';
import { expectNoA11yViolations } from '@/test/a11y';

import type { ArtworkSubject } from './ArtworkPreview';
import { ArtworkUploader } from './ArtworkUploader';
import type { MintResult } from './state';

/**
 * The picture picker's four moments (frame: `SERMON-AUDIO-ARTWORK`), with its one
 * effectful seam faked because jsdom has no network.
 *
 * The claim worth testing above the state machine is the one the frame exists for: this
 * field says the OPPOSITE thing depending on what the message already wears. On a synced
 * message it argues AGAINST an upload, because the YouTube thumbnail is usually right; on
 * a message that was never on YouTube it argues for one. A field that always nags is how a
 * shelf fills with pictures nobody asked for.
 */

const PATH = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa.jpg';
const text = copy.sermonAudio.artwork;

const YOUTUBE: ArtworkSubject = {
  url: 'https://i.ytimg.com/vi/abc/hqdefault.jpg',
  kind: 'youtube',
};
const NOTHING: ArtworkSubject = { url: null, kind: 'none' };

function mintOk(): Promise<MintResult> {
  return Promise.resolve({
    ok: true,
    path: PATH,
    token: 'token',
    signedUrl: 'http://storage.test/upload',
  });
}

function jpegFile(bytes = 400 * 1024): File {
  return new File([new Uint8Array(bytes)], 'midweek-series.jpg', {
    type: 'image/jpeg',
  });
}

function renderPicker(
  overrides: {
    subject?: ArtworkSubject;
    mint?: () => Promise<MintResult>;
    upload?: () => Promise<void>;
    submitLabel?: string;
  } = {},
) {
  return render(
    // A real form around it: any Save reads useFormStatus from the form it belongs to.
    <form>
      <ArtworkUploader
        subject={overrides.subject ?? YOUTUBE}
        mint={overrides.mint ?? mintOk}
        submitLabel={overrides.submitLabel}
        submittingLabel={text.saving}
        seams={{ upload: overrides.upload ?? (() => Promise.resolve()) }}
      />
    </form>,
  );
}

function fileInput(): HTMLInputElement {
  const input = document.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error('no file input');
  return input;
}

describe('before a picture is chosen', () => {
  test('a synced message is told it needs nothing, and shows what it wears', async () => {
    const { container } = renderPicker({ subject: YOUTUBE });

    expect(screen.getByText(text.hasThumbnailHint)).toBeInTheDocument();
    expect(screen.queryByText(text.noThumbnailHint)).not.toBeInTheDocument();
    // The preview is the fact the reader came for, so it is never decorative.
    expect(screen.getByAltText(text.previewYouTube)).toHaveAttribute(
      'src',
      YOUTUBE.url,
    );

    await expectNoA11yViolations(container);
  });

  test('a message with no picture is told what it looks like today', async () => {
    const { container } = renderPicker({ subject: NOTHING });

    expect(screen.getByText(text.noThumbnailHint)).toBeInTheDocument();
    // The branded cover is drawn, not fetched, so it has no <img> to carry the name:
    // the description goes to a screen reader instead of an empty box going to nobody.
    expect(screen.getByText(text.previewNone)).toBeInTheDocument();

    await expectNoA11yViolations(container);
  });

  test('there is no Save at all: hidden, not disabled', () => {
    renderPicker({ submitLabel: text.save });
    expect(
      screen.queryByRole('button', { name: text.save }),
    ).not.toBeInTheDocument();
  });
});

describe('a good picture', () => {
  test('uploads and contributes the hidden field the save action reads', async () => {
    const user = userEvent.setup();
    const { container } = renderPicker({});

    await user.upload(fileInput(), jpegFile());

    expect(await screen.findByText(text.readyTitle(400))).toBeInTheDocument();
    expect(
      container.querySelector('input[name="artworkPath"]'),
    ).toHaveAttribute('value', PATH);
    // On the attach and create forms this owns no Save: the audio uploader's covers the
    // whole form, and two primary buttons on one form is two ways to mean one thing.
    expect(
      screen.queryByRole('button', { name: text.save }),
    ).not.toBeInTheDocument();

    await expectNoA11yViolations(container);
  });

  test('on the manage screen it stands alone, so it owns its Save', async () => {
    const user = userEvent.setup();
    renderPicker({ submitLabel: text.save });

    await user.upload(fileInput(), jpegFile());

    expect(
      await screen.findByRole('button', { name: text.save }),
    ).toBeInTheDocument();
  });

  test('choosing a different picture returns to the drop zone', async () => {
    const user = userEvent.setup();
    renderPicker({});

    await user.upload(fileInput(), jpegFile());
    await screen.findByText(text.readyTitle(400));

    await user.click(screen.getByRole('button', { name: text.chooseAnother }));
    expect(screen.getByText(text.dropTitle)).toBeInTheDocument();
    expect(
      document.querySelector('input[name="artworkPath"]'),
    ).not.toBeInTheDocument();
  });
});

describe('early refusals, before any upload', () => {
  test('a file that is not a picture is refused without a mint', async () => {
    const mint = vi.fn(mintOk);
    renderPicker({ mint });

    // fireEvent rather than user.upload: userEvent honours the accept filter and would
    // silently drop the file, which is the browser picker's behaviour, not the drop
    // zone's. A drop can hand over anything.
    fireEvent.change(fileInput(), {
      target: {
        files: [new File(['plain'], 'notes.pdf', { type: 'application/pdf' })],
      },
    });

    expect(await screen.findByText(text.pickNotImage)).toBeInTheDocument();
    expect(mint).not.toHaveBeenCalled();
  });

  test('a picture over the cap names its size rather than the rule alone', async () => {
    renderPicker({});

    fireEvent.change(fileInput(), {
      target: { files: [jpegFile(7 * 1048576)] },
    });

    expect(await screen.findByText(text.pickTooBig(7))).toBeInTheDocument();
  });

  test('a .jpeg is the same format as a .jpg and gets in', async () => {
    // The server mints one spelling per format, so this is where the other one is
    // normalised rather than refused at the door for being spelled out.
    const mint = vi.fn(mintOk);
    renderPicker({ mint });

    fireEvent.change(fileInput(), {
      target: {
        files: [new File([new Uint8Array(1024)], 'cover.jpeg', { type: '' })],
      },
    });

    expect(await screen.findByText(text.readyTitle(1))).toBeInTheDocument();
    expect(mint).toHaveBeenCalledWith('jpg');
  });
});

describe('an upload that dies', () => {
  test('says so, keeps nothing, and offers the drop zone again', async () => {
    const user = userEvent.setup();
    renderPicker({ upload: () => Promise.reject(new Error('network gone')) });

    await user.upload(fileInput(), jpegFile());

    expect(await screen.findByText(text.uploadFailed)).toBeInTheDocument();
    expect(screen.getByText(text.dropTitle)).toBeInTheDocument();
    expect(
      document.querySelector('input[name="artworkPath"]'),
    ).not.toBeInTheDocument();
  });
});
