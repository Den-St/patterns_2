// Базовий клас товару
class Item {
  constructor(name, price) {
    this.name = name;
    this.price = price;
  }

  getPrice() {
    return this.price;
  }
}

// Товар "Їжа"
class FoodItem extends Item {
  getPrice() {
    return this.price * 0.9;
  }
}

// Товар "Електроніка"
class ElectronicsItem extends Item {
  getPrice() {
    return this.price * 1.2;
  }
}

// Інші товари
class OtherItem extends Item {}

// Клас замовлення
class Order {
  constructor(items, customer) {
    this.items = items;
    this.customer = customer;
  }

  calculateTotal() {
    return this.items.reduce((total, item) => total + item.getPrice(), 0);
  }

  printReceipt() {
    console.log("Замовлення для: " + this.customer);

    this.items.forEach(item => {
      console.log(`${item.name} - ${item.getPrice()} грн`);
    });

    console.log("Загальна сума: " + this.calculateTotal() + " грн");
  }
}

// Використання
let items = [
  new FoodItem("Хліб", 20),
  new ElectronicsItem("Телефон", 5000),
  new OtherItem("Книга", 200)
];

let order = new Order(items, "Олексій");
order.printReceipt();