import { type FormEvent, startTransition } from "react";

/**
 * Props for a form that keeps what was typed when its action reports an error.
 * React resets a `<form action={fn}>` as soon as the action finishes, also when
 * it failed; calling the action from onSubmit doesn't. Browser validation still
 * runs first, and useActionState's pending state still works.
 *
 * `action` stays on the form on purpose. Before the page has hydrated React
 * holds a submit back and replays it through `action`; with onSubmit alone the
 * browser would submit the form itself and put its fields, passwords too, in
 * the address. Once hydrated, onSubmit prevents the default and takes over.
 *
 *   <form {...keepValues(action)} className="...">
 */
export function keepValues(action: (data: FormData, form?: HTMLFormElement) => unknown) {
  return {
    action: async (data: FormData) => {
      await action(data);
    },
    onSubmit(event: FormEvent<HTMLFormElement>) {
      event.preventDefault();
      const submitter = (event.nativeEvent as SubmitEvent).submitter;
      const form = event.currentTarget;
      const data = new FormData(form, submitter);
      startTransition(async () => {
        await action(data, form);
      });
    },
  };
}
