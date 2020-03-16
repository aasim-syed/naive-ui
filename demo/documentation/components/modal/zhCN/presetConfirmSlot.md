# 使用 Confirm 预设的插槽
插槽也会随着预设变动。
```html
<n-button
  @click="isActive = true"
>
  来吧
</n-button>
<n-modal v-model="isActive" 
  preset="confirm"
  title="Confirm"
>
  <template v-slot:header>
    <div>标题</div>
  </template>
  <div>内容</div>
  <template v-slot:action>
    <div>操作</div>
  </template>
</n-modal>
```
```js
export default {
  data () {
    return {
      isActive: false,
    }
  }
}
```