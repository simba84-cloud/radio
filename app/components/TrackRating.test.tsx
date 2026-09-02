import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { TrackRating } from "./TrackRating";

const TRACK = { artist: "Led Zeppelin", title: "Kashmir" };

let fetchMock: ReturnType<typeof vi.fn>;

const json = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const thumbUp = () => screen.getByRole("button", { name: /thumbs up/i });
const thumbDown = () => screen.getByRole("button", { name: /thumbs down/i });

beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue(json({ up: 4, down: 1, mine: null }));
  vi.stubGlobal("fetch", fetchMock);
});

test("shows the tally once it loads", async () => {
  render(<TrackRating {...TRACK} />);

  await waitFor(() => expect(thumbUp()).toHaveAccessibleName(/4 so far/));
  expect(thumbDown()).toHaveAccessibleName(/1 so far/);
  expect(screen.getByText("Rate this track:")).toBeInTheDocument();
});

test("disables both buttons until the tally arrives", () => {
  render(<TrackRating {...TRACK} />);

  expect(thumbUp()).toBeDisabled();
  expect(thumbDown()).toBeDisabled();
});

test("casts a vote and shows the returned tally", async () => {
  const user = userEvent.setup();
  render(<TrackRating {...TRACK} />);
  await waitFor(() => expect(thumbUp()).toBeEnabled());

  fetchMock.mockResolvedValueOnce(
    json({ up: 5, down: 1, mine: 1, accepted: true }, 201),
  );
  await user.click(thumbUp());

  await waitFor(() => expect(thumbUp()).toHaveAccessibleName(/5 so far/));
  expect(screen.getByText("Thanks for rating:")).toBeInTheDocument();

  const [url, init] = fetchMock.mock.calls.at(-1)!;
  expect(url).toBe("/api/ratings");
  expect(JSON.parse(init.body)).toEqual({ ...TRACK, rating: 1 });
});

test("locks both buttons after voting", async () => {
  const user = userEvent.setup();
  render(<TrackRating {...TRACK} />);
  await waitFor(() => expect(thumbUp()).toBeEnabled());

  fetchMock.mockResolvedValueOnce(json({ up: 5, down: 1, mine: 1 }, 201));
  await user.click(thumbUp());

  await waitFor(() => expect(thumbUp()).toBeDisabled());
  expect(thumbDown()).toBeDisabled();
  expect(thumbUp()).toHaveAttribute("aria-pressed", "true");
});

/**
 * A 409 is not an error path here: the body carries the authoritative tally,
 * including this listener's original choice, so the UI settles on truth.
 */
test("settles on the tally a 409 returns, without showing an error", async () => {
  const user = userEvent.setup();
  render(<TrackRating {...TRACK} />);
  await waitFor(() => expect(thumbUp()).toBeEnabled());

  fetchMock.mockResolvedValueOnce(
    json({ up: 9, down: 2, mine: -1, accepted: false }, 409),
  );
  await user.click(thumbUp());

  // Their original vote was a thumbs down; the UI must reflect that, not the
  // button they just pressed.
  await waitFor(() => expect(thumbDown()).toHaveAttribute("aria-pressed", "true"));
  expect(thumbUp()).toHaveAttribute("aria-pressed", "false");
  expect(thumbUp()).toHaveAccessibleName(/9 so far/);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

test("reports a failure to reach the service", async () => {
  fetchMock.mockRejectedValue(new Error("offline"));
  render(<TrackRating {...TRACK} />);

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      /couldn't reach the ratings service/i,
    ),
  );
});

test("reports a failed vote but stays usable", async () => {
  const user = userEvent.setup();
  render(<TrackRating {...TRACK} />);
  await waitFor(() => expect(thumbUp()).toBeEnabled());

  fetchMock.mockResolvedValueOnce(json({ error: "boom" }, 500));
  await user.click(thumbUp());

  await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  expect(thumbUp()).toBeEnabled();
});

test("shows placeholders and no tally before a track is known", () => {
  render(<TrackRating artist={null} title={null} />);

  expect(fetchMock).not.toHaveBeenCalled();
  expect(thumbUp()).toBeDisabled();
  expect(screen.getAllByText("–")).toHaveLength(2);
});

test("refetches and clears the old tally when the track changes", async () => {
  const { rerender } = render(<TrackRating {...TRACK} />);
  await waitFor(() => expect(thumbUp()).toHaveAccessibleName(/4 so far/));

  fetchMock.mockResolvedValue(json({ up: 0, down: 0, mine: null }));
  rerender(<TrackRating artist="Slowdive" title="Alison" />);

  // The previous song's numbers must not linger on the new track.
  expect(thumbUp()).toHaveAccessibleName(/^Thumbs up$/);
  await waitFor(() => expect(thumbUp()).toHaveAccessibleName(/0 so far/));
});

test("refreshes the tally every 20s while a track plays", async () => {
  vi.useFakeTimers();
  try {
    render(<TrackRating {...TRACK} />);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(20_000);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});

test("stops polling and aborts in flight requests on unmount", async () => {
  vi.useFakeTimers();
  try {
    const { unmount } = render(<TrackRating {...TRACK} />);
    await vi.advanceTimersByTimeAsync(0);

    const signal = fetchMock.mock.calls[0][1].signal as AbortSignal;
    unmount();

    expect(signal.aborted).toBe(true);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});
