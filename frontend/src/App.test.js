import { render, screen } from "@testing-library/react";
import App from "./App";

test("renders Meet Memo header", () => {
  render(<App />);
  const headerElement = screen.getByText(/meet memo/i);
  expect(headerElement).toBeInTheDocument();
});
