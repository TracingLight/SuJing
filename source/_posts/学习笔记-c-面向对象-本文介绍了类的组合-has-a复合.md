---
title: 类的组合
date: '2026-09-04 21:48:46'
updated: '2026-09-04 21:48:46'
categories:
  - 学习笔记
tags:
  - C++
  - 面向对象
description: 本文介绍了类的组合（has-a复合）的概念、内存布局与构造析构顺序，并演示了如何利用复合实现Adapter模式。
cover: /img/covers/c-o-e-mtn07s0n.webp
copyright: true
---

在能够独立设计好一个单一类（基于对象设计）之后，接下来的问题就是如何让多个类之间发生关系，以构建更复杂的系统？

## 什么是“has-a”与复合

核心定义：复合或者说组合（Composition）是指一个类（容器，Container）的数据成员是另一个类（组件，Component）的对象（或对象数组）。这是一种强拥有（Ownership）关系：组件对象直接嵌套在容器的内存布局中，生命周期完全由容器管理。


C++ 代码示意：

```cpp
class Engine { /* ... */ };

class Car {
private:
    Engine engine;  // 复合：Car "has-a" Engine
    // ...
};
```

## 复合对象的大小如何计算？

内存布局规则：复合对象的内存大小 = <span style="color:#287b86">自身数据成员大小 + 所有组件对象大小之和</span>，并考虑内存对齐（alignment）。组件对象是容器对象的“物理组成部分”，直接嵌套在内存中。

示例：sizeof(Car)

```cpp
class Engine { int cylinders; }; // 假设 4 字节
class Wheel  { int diameter; };  // 假设 4 字节

class Car {
    Engine engine;  // 4 字节
    Wheel wheels[4]; // 4*4 = 16 字节
    int speed;       // 4 字节
};
// sizeof(Car) ≈ 24 + 对齐填充
```

## 构造与析构顺序

![image](/img/posts/image-mtn0cdvj.png)

常见误解为认为容器对象先构造，组件对象后构造。实际顺序为：先组件（按声明顺序），后容器。析构时顺序完全相反。

## 利用复合实现 Adapter 模式

Adapter 模式（对象适配器）

通过复合关系，让一个类（Adapter）包含另一个类的对象（Adaptee），并将客户端期望的接口转换为 Adaptee 提供的接口。核心是“接口转换”，无需修改 Adaptee 的源代码。

场景：客户端需要调用 `draw()` 接口，但现有类 `LegacyShape` 只提供 `render()` 方法。

行动：创建 `ShapeAdapter` 类，内部复合一个 `LegacyShape` 对象，并实现 `draw()` 方法，在内部调用 `render()`。

结果：客户端可以统一使用 `draw()` 接口，无需感知 `LegacyShape` 的存在。

```cpp
class LegacyShape {
public:
    void render() { /* 旧接口实现 */ }
};

class ShapeAdapter {
private:
    LegacyShape legacy;  // 复合：Adapter "has-a" Adaptee
public:
    void draw() {        // 新接口
        legacy.render(); // 内部委托给旧接口
    }
};
```
> 复合型 Adapter 相比于继承型 Adapter 的优势在于：它不需要继承 Adaptee 类，因此可以适配一个类及其所有子类，更加灵活。
> 在实际项目中，优先使用复合型 Adapter，遵循“优先使用复合，而非继承”的设计原则。
