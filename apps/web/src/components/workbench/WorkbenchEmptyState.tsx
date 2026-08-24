export function WorkbenchEmptyState(props: {
  readonly title: string;
  readonly description: string;
}) {
  return (
    <div className="grid min-h-64 place-content-center rounded-2xl border border-dashed border-border/70 px-6 text-center">
      <p className="font-medium text-sm">{props.title}</p>
      <p className="mt-1 max-w-md text-muted-foreground text-xs leading-5">{props.description}</p>
    </div>
  );
}
