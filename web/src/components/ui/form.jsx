import React from "react";
import {
  Controller,
  FormProvider,
  useFormContext,
  useFormState,
} from "react-hook-form";

export const Form = FormProvider;

export function formControlClass(className = "", invalid = false) {
  return `${className} ${invalid ? "!border-rose-500 focus:!border-rose-500 focus:!ring-rose-500 dark:!border-rose-500" : "border-neutral-300 focus:border-blue-500 dark:border-neutral-700"}`;
}

const FieldContext = React.createContext(null);
const ItemContext = React.createContext(null);

export function FormField({ name, ...props }) {
  return (
    <FieldContext.Provider value={{ name }}>
      <Controller name={name} {...props} />
    </FieldContext.Provider>
  );
}

export function useFormField() {
  const field = React.useContext(FieldContext);
  const item = React.useContext(ItemContext);
  const { getFieldState } = useFormContext();
  const state = useFormState({ name: field?.name });
  if (!field || !item)
    throw new Error("useFormField must be used inside FormField and FormItem");
  const fieldState = getFieldState(field.name, state);
  return {
    ...field,
    ...item,
    ...fieldState,
    formItemId: `${item.id}-control`,
    formDescriptionId: `${item.id}-description`,
    formMessageId: `${item.id}-message`,
  };
}

export function FormItem({ className = "", children, ...props }) {
  const id = React.useId();
  return (
    <ItemContext.Provider value={{ id }}>
      <div
        data-slot="form-item"
        className={`grid gap-1.5 ${className}`}
        {...props}
      >
        {children}
      </div>
    </ItemContext.Provider>
  );
}

export function FormLabel({ className = "", children, ...props }) {
  const { error, formItemId } = useFormField();
  return (
    <label
      htmlFor={formItemId}
      className={`${error ? "text-rose-600 dark:text-rose-400" : "text-neutral-700 dark:text-neutral-300"} text-sm font-medium ${className}`}
      {...props}
    >
      {children}
    </label>
  );
}

export function FormControl({ children }) {
  const { error, formItemId, formDescriptionId, formMessageId } =
    useFormField();
  return React.cloneElement(children, {
    id: formItemId,
    "aria-invalid": Boolean(error),
    "aria-describedby": error
      ? `${formDescriptionId} ${formMessageId}`
      : formDescriptionId,
    className: formControlClass(children.props.className || "", Boolean(error)),
  });
}

export function FormDescription({ className = "", children, ...props }) {
  const { formDescriptionId } = useFormField();
  return (
    <p
      id={formDescriptionId}
      className={`text-xs leading-5 text-neutral-500 dark:text-neutral-400 ${className}`}
      {...props}
    >
      {children}
    </p>
  );
}

export function FormMessage({ className = "", children, ...props }) {
  const { error, formMessageId } = useFormField();
  const message = error?.message || children;
  if (!message) return null;
  return (
    <p
      id={formMessageId}
      className={`text-xs text-rose-600 dark:text-rose-400 ${className}`}
      {...props}
    >
      {message}
    </p>
  );
}

export default Form;
