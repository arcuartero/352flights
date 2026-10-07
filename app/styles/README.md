# Stylesheet structure

The existing CSS entry points remain imported by their routes. Their ordered imports split each cascade into smaller, named files. The numeric order is intentional; do not sort imports by selector or remove repeated selectors without checking their media query and override context.

Edit the module containing the component you are changing. Keep responsive overrides after the base rules they override. Small component stylesheets stay beside their components or routes. Asset URLs remain root-relative or inline.

This extraction preserves every byte of the original CSS when the modules are concatenated in order.

- `app/globals.css`: 10 modules, 739 top-level CSS nodes.
- `app/home.css`: 5 modules, 356 top-level CSS nodes.
- `app/ops.css`: 9 modules, 946 top-level CSS nodes.
- `app/preferences.css`: 2 modules, 179 top-level CSS nodes.
- `app/public-deals-date-picker.css`: 1 modules, 69 top-level CSS nodes.
- `app/deals/deals-redesign.css`: 8 modules, 508 top-level CSS nodes.
- `app/preferences/preferences-redesign.css`: 1 modules, 104 top-level CSS nodes.
