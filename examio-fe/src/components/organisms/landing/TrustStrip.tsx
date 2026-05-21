const trustItems = [
  "Sinh viên trên toàn quốc",
  "Học viên ôn thi THPT",
  "Giảng viên & gia sư",
];

export default function TrustStrip() {
  return (
    <section className="border-y border-hairline bg-surface-soft py-10">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <p className="text-center text-[12px] font-medium uppercase tracking-[1.5px] text-muted-foreground">
          Được tin dùng bởi
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-3">
          {trustItems.map((item) => (
            <span
              key={item}
              className="font-display text-[18px] font-medium text-ink/80"
            >
              {item}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
