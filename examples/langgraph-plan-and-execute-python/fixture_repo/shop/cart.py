def subtotal(items):
    """Sum of line totals. `items` is a list of (unit_price, quantity) pairs."""
    return sum(price for price, quantity in items)
