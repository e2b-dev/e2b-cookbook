from shop.cart import subtotal
from shop.discount import apply_discount


def test_subtotal_multiplies_price_by_quantity():
    assert subtotal([(10.0, 2), (5.0, 3)]) == 35.0


def test_subtotal_of_nothing_is_zero():
    assert subtotal([]) == 0


def test_discount_reduces_the_amount():
    assert apply_discount(200.0, 25) == 150.0


def test_zero_discount_changes_nothing():
    assert apply_discount(80.0, 0) == 80.0
