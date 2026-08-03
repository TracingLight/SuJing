---
title: 友元函数
date: '2026-07-30 06:17:29'
updated: '2026-07-30 06:17:29'
categories:
  - 学习笔记
tags:
  - C++
  - 面向对象
description: 本文介绍了C++中友元函数的概念、特性、使用场景，以及同一个类的不同对象可以互相访问私有成员的规则。
cover: /img/covers/a-e-o-ms745eps.webp
copyright: true
cover_position: 56.4% 21.3%
---

面向对象中有一个看似“破坏规则”但实则精妙的设计工具友元（friend），在严格封装的C++世界中，何时以及为何需要允许外部代码“窥探”类的私有成员？下面的内容会解答这个问题。

## 封装与访问控制

[类的访问控制与封装](/2026/07/27/学习笔记-c-面向对象-4/)

## friend关键字

friend机制是封装原则的一个可控的、明确的例外。它允许一个非成员函数或另一个类，访问本类的所有私有(private)和保护(protected)成员。

核心概念：友元声明 (Friend Declaration)

语法：在类定义内部，使用 friend 关键字后接函数或类的声明。

关键特性：

- 单向性 ：A声明B是友元，意味着B可以访问A的私有成员，但A不能自动访问B的私有成员（除非B也声明A为友元）。
- 不受访问控制影响 ：friend声明可以放在类定义的public、protected或private区域，效果完全相同。惯例是放在类定义的开始或结尾。
- 不是成员函数 ：友元函数不属于这个类，因此没有this指针。

友元关系不具有传递性：

- 如果A是B的友元，且B是C的友元，并不意味着A是C的友元。
- 如果A是B的友元，且B是A的友元，这是相互友元关系，需要分别在两个类中声明对方为友元。

示例代码

```cpp
class Vector;  // 前向声明

class Matrix {
private:
    double data[3][3];
    
public:
    // 声明全局函数为友元
    friend Vector operator*(const Matrix& m, const Vector& v);
    
    // 声明另一个类为友元
    friend class MatrixCalculator;
};

// 友元函数可以访问Matrix的私有成员data
Vector operator*(const Matrix& m, const Vector& v) {
    Vector result;
    for (int i = 0; i < 3; i++) {
        for (int j = 0; j < 3; j++) {
            result[i] += m.data[i][j] * v[j];  // 直接访问私有成员
        }
    }
    return result;
}
```

## 同一个类的不同对象互为友元

C++有一个特殊但重要的规则：同一个类的不同对象可以互相访问彼此的私有成员。这意味着在类的成员函数中，不仅可以访问当前对象(this)的私有成员，还可以访问同类型其他对象的私有成员。

核心概念：类内友元访问

这个规则基于一个简单的逻辑：如果类A的成员函数知道如何操作A的私有数据，那么它也应该知道如何操作另一个A对象的私有数据，因为它们具有相同的类型和结构。

示例场景：

实现一个compare()成员函数，比较当前对象与另一个同类型对象的大小：

```cpp
class MyClass {
private:
    int secretValue;
    
public:
    MyClass(int val) : secretValue(val) {}
    
    // 可以访问另一个MyClass对象的私有成员
    bool isGreaterThan(const MyClass& other) const {
        // 直接访问other.secretValue，即使other是另一个对象
        return this->secretValue > other.secretValue;
    }
    
    // 复制构造函数中访问另一个对象的私有成员
    MyClass(const MyClass& other) {
        this->secretValue = other.secretValue;  // 合法！
    }
};

int main() {
    MyClass obj1(10);
    MyClass obj2(20);
    
    bool result = obj1.isGreaterThan(obj2);  // 返回false
    // obj1的成员函数可以访问obj2的私有成员secretValue
    return 0;
}
```

为什么允许这种访问？

设计哲学一致性：类的设计者已经定义了该类型数据的合法操作方式。既然成员函数知道如何正确处理本类的数据，那么让它处理另一个同类型对象的数据也是安全的。

实现便利性：许多操作（如比较、赋值、复制）天然需要访问另一个对象的内部状态。如果禁止这种访问，就需要为每个需要比较的私有成员提供公有getter函数，这会破坏封装。

类型安全性：这种访问仅限于相同类型的对象之间，不会扩展到其他类型，保持了类型系统的完整性。

这个特性在实现复制构造函数、赋值运算符、比较运算符、序列化/反序列化等需要访问另一个对象完整状态的场景中非常有用。

![image](/img/posts/image-ms74fyru.png)

