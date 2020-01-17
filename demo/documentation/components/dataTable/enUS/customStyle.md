# Custom Style

> Row: Set row-class-name prop with a function to assign a class name to certain rows.
> Column: Set className key to columns prop's object to assign a class name to a certain column.

```html
<n-data-table
  ref="table"
  :columns="columns"
  :data="data"
  :row-class-name="rowClassName"
/>
```

```js
const data = [
  {
    key: "1",
    name: "John Brown",
    age: 32,
    address: "New York No. 1 Lake Park"
  },
  {
    key: "2",
    name: "Jim Green",
    age: 42,
    address: "London No. 1 Lake Park"
  },
  {
    key: "3",
    name: "Joe Black",
    age: 32,
    address: "Sidney No. 1 Lake Park"
  }
]

export default {
  data() {
    return {
      data: data,
      columns: [
        {
          title: "Name",
          key: "name"
        },
        {
          title: "Age",
          key: "age",
          className: "age"
        },
        {
          title: "Address",
          key: "address"
        }
      ]
    }
  },
  methods: {
    rowClassName(row, index) {
      if (row.age > 32) {
        return "too-old"
      }
      return null
    }
  }
}
```

```css
/deep/ .too-old {
  color: red
}
/deep/ .age {
  background: skyblue
}
```