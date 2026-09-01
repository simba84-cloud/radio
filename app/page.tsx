import Image from "next/image";
import { RadioPlayer } from "./components/RadioPlayer";

/**
 * Header proportions come from RadioCalicoLayout.png: a 75px graphite bar with
 * a ~56px logo centred between the two halves of the wordmark.
 */
export default function Home() {
  return (
    <>
      <header className="bg-graphite">
        <div className="flex h-[75px] items-center justify-center gap-3">
          <span className="font-display text-h2 font-bold text-mint">Radio</span>
          <Image
            src="/radio-calico-logo.png"
            alt="Radio Calico"
            width={56}
            height={56}
            priority
            className="rounded-full"
          />
          <span className="font-display text-h2 font-bold text-mint">
            Calico
          </span>
        </div>
      </header>

      <main className="flex-1">
        <RadioPlayer />
      </main>
    </>
  );
}
