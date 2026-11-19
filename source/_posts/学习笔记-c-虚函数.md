---
title: 虚函数详解
date: '2026-11-18 22:24:56'
categories:
  - 学习笔记
tags:
  - C++
  - 面向对象
description: 从同一个基类引用为什么能调用不同函数讲起，通过可运行的例子理解C++虚函数、override、对象切片和虚析构，再用sizeof和汇编观察虚函数表与虚指针。
copyright: true
updated: '2026-11-19 11:02:34'
cover: /img/covers/preview-upscaled-4x-mwma3qjj.webp
---

# 虚函数详解

观前提醒：建议先阅读[继承](/2026/09/16/学习笔记-c-面向对象-介绍c-中public继承的-is/)

> 明明传进去的是一个 `Student`，为什么打印出来的是 `Person`？能不能让同一个函数收到学生就打印 `Student`，收到老师就打印 `Teacher`？

## 同一个学生，为什么打印出了两个身份？

上一篇聊到，`Student` 公开继承 `Person`，表达的是「学生是一种人」

那我写一个接收 `Person` 引用的函数，拿它来打印学生的身份，应该没什么问题吧？先猜一下下面会输出什么

```cpp
#include <iostream>

struct Person
{
    const char* role() const
    {
        return "Person";
    }
};

struct Student : Person
{
    const char* role() const
    {
        return "Student";
    }
};

void printRole(const Person& person)
{
    std::cout << person.role() << '\n';
}

int main()
{
    Student student;
    std::cout << student.role() << '\n';
    printRole(student);
}
```

```text
Student
Person
```

`printRole` 拿到的是引用，还是原来的学生对象。但 `person` 声明为 `const Person&`，普通成员函数会按声明里的类型来选，所以调用了 `Person::role()`

想让它调用学生自己的版本，只要在基类的 `role()` 前加上 `virtual`，把它声明为{% annotation "用 virtual 声明、允许派生类重写的成员函数" %}虚函数{% endannotation %}：

```cpp
virtual const char* role() const
{
    return "Person";
}
```

再跑一次，两行都输出 `Student`。派生类给基类的虚函数提供自己的版本，这叫{% annotation "派生类给基类虚函数提供新实现，声明要和基类一致" %}重写{% endannotation %}

看 `person.role()` 时，分清两种类型就够了：

- {% annotation "声明里写出来的类型，编译期就能确定" %}静态类型{% endannotation %}：从声明就能确定，这里找的是 `Person` 的接口
- {% annotation "运行时实际指向的对象类型" %}动态类型{% endannotation %}：看实际对象，这里选的是 `Student` 的版本

同一行代码，传进学生就用学生的版本，传进老师就用老师的版本，这就是{% annotation "同一处调用按实际对象选择实现，C++ 里主要靠虚函数" %}运行时多态{% endannotation %}。通过基类指针调用也是一样的

### override：少写一个 const，怎么就不重写了？

派生类重写的函数仍然是虚函数，可以在声明的末尾加上 `override`，告诉编译器「我想重写基类的虚函数，请帮我检查这个声明对不对」

```cpp
struct Student : Person
{
    const char* role() const override
    {
        return "Student";
    }
};
```

试一下把 `role()` 后面的 `const` 删掉：

```cpp
//假设基类的role()后面还带着const
const char* role() override  //编译错误
{
    return "Student";
}
```

少的是括号后面的 `const`。如果连 `override` 也去掉，这段代码能编译，但只是多了个同名函数，没有重写基类的 `role()`。再调用 `printRole(student)`，打印的还是 `Person`

这就是**隐藏**：派生类声明了同名函数，直接从派生类找这个名字时，就不会再去基类找同名函数，哪怕参数不同

| 概念 | 怎么辨认 |
| --- | --- |
| 重载 | 同一作用域里有多个同名函数，比如 `f(int)` 和 `f(double)`，编译器根据实参选一个 |
| 重写 | 派生类为基类的虚函数提供新实现，比如 `Student::role() const`，通过基类引用也能调到它 |
| 隐藏 | 派生类声明了同名成员，比如漏掉 `const` 的 `Student::role()`，名字一样，但没有重写 |

平时可能容易把两步混在一起：**先按静态类型找函数、选重载，再按动态类型选这个虚函数的实现**。派生类自己新增的重载，不会凭空出现在基类接口里

如果显式写 `person.Person::role()`，就是指定调用基类版本，不走虚派发。`override` 负责检查有没有重写，`final` 则可以禁止下一层再重写

### 虚函数带默认参数，参数听谁的？

默认参数由**调用处的静态类型**决定，虚派发只决定执行哪个函数体。比如运行下面的程序，会输出 `Derived 1`，不是 `Derived 2`

```cpp
#include <iostream>

struct Base
{
    virtual void show(int n = 1)
    {
        std::cout << "Base " << n << '\n';
    }
};

struct Derived : Base
{
    void show(int n = 2) override
    {
        std::cout << "Derived " << n << '\n';
    }
};

int main()
{
    Derived derived;
    Base& view = derived;
    view.show();
}
```

`view` 是从 `Base` 的声明拿到默认值 `1`，再带着这个值调用 `Derived::show()`。直接写 `derived.show()` 才会取默认值 `2`

### 把 & 去掉，virtual 也救不回来了

继续用加了 `virtual` 和 `override` 的版本，把下面几行放进 `main`：

```cpp
Student student;
const Person& view = student;  //借用原来的Student对象
Person copy = student;         //创建一个新的Person对象

printRole(view);  //Student
printRole(copy);  //Person
```

`view` 引用的还是原来的 `Student`，而 `copy` 是新建的 `Person`，只复制了基类部分，这叫{% annotation "用基类类型按值复制派生对象，派生类部分会被丢掉" %}对象切片{% endannotation %}

把 `printRole` 的参数改成按值传递的 `Person person`，也会发生同样的事

## 基类不想提供默认实现怎么办？

如果 `Person` 不想给一个默认身份，只想要求每个具体的派生类提供 `role()`，就把它声明为{% annotation "声明末尾写 = 0 的虚函数，要求派生类给出实现" %}纯虚函数{% endannotation %}，也就是在声明末尾写 `= 0`：

```cpp
struct Person
{
    virtual const char* role() const = 0;
};

struct Student : Person
{
    const char* role() const override
    {
        return "Student";
    }
};
```

`Person` 现在是{% annotation "还有纯虚函数没实现的类，不能直接创建对象" %}抽象类{% endannotation %}，不能直接创建 `Person` 对象，但还可以用 `Person&` 或 `Person*` 来访问 `Student`

如果 `Student` 不重写 `role()`，它也还是抽象类

`= 0` 不是说函数绝对不能有函数体，纯虚函数也可以在类外提供定义，通常放一些公共的默认代码，供派生类在重写时显式调用，比如子类里写 `Person::role();`。但有了定义，`Person` 仍然是抽象类

{% annotation "析构函数写 = 0，类外仍需提供定义" %}纯虚析构{% endannotation %}是个常见追问：`virtual ~Base() = 0;` 同样能让 `Base` 成为抽象类，但仍要在类外写 `Base::~Base() = default;`，因为派生对象析构时，基类部分总得收尾

## 有虚函数，析构函数就必须是虚的吗？

不一定，关键是会不会通过基类指针删除派生对象

局部变量 `Student student;` 离开作用域时，本来就会先析构 `Student`，再析构 `Person`。但如果写成 `Person* p = new Student();`，再执行 `delete p;`，`Person` 的析构函数不是虚函数就会产生{% annotation "标准不规定程序会做什么，结果不可依赖" %}未定义行为{% endannotation %}，也就是 C++ 不保证会发生什么，不能说它一定只调用 `~Person()`

### 允许通过基类删除：public virtual

如果接口就是要让调用方拿着 `Person*` 或者 `unique_ptr<Person>` 管理派生对象，那就让 `Person` 提供公开的虚析构：

```cpp
#include <iostream>
#include <memory>

struct Person
{
    virtual ~Person()
    {
        std::cout << "~Person\n";
    }
};

struct Student : Person
{
    ~Student() override
    {
        std::cout << "~Student\n";
    }
};

int main()
{
    std::unique_ptr<Person> person = std::make_unique<Student>();
}
```

输出是：

```text
~Student
~Person
```

`virtual ~Person()` 就是{% annotation "让基类指针 delete 能调用到派生类析构" %}虚析构函数{% endannotation %}

### 不允许外部通过基类删除：protected 非虚

换一种设计，`Person` 只想提供用来借用的接口，调用方根本不该拿 `Person*` 去删除对象

那可以把析构函数设为 `protected`：

```cpp
struct Person
{
    virtual const char* role() const
    {
        return "Person";
    }

protected:
    ~Person() = default;
};

struct Student : Person
{
    const char* role() const override
    {
        return "Student";
    }
};

int main()
{
    Student student;  //离开作用域时正常析构
    Person* view = &student;
    view->role();
    //delete view;  //取消注释会报错：Person的析构函数不可访问
}
```

取消注释 `delete view;` 会编译失败，因为 `~Person()` 是 `protected`

默认删除器的 `unique_ptr<Person>` 也会通过 `Person*` 执行 `delete`，不会自动绕过这条规则，和 `shared_ptr` 的区别可以看[智能指针详解](/2026/11/15/学习笔记-c-智能指针/)

用 `std::make_shared<Student>()` 建立所有权，再转成 `shared_ptr<Person>`，情况不同，原来销毁 `Student` 的方式会保留下来。但如果先把地址存成 `Person*`，再拿这个指针创建 `shared_ptr<Person>`，就不能靠智能指针找回已经丢掉的类型信息

## 构造和析构的时候，调虚函数又会怎样？

刚才说普通虚调用会找实际对象的实现

那如果 `Person` 构造函数里就写一句 `role()`，它会不会调用 `Student::role()`？

```cpp
#include <iostream>

struct Person
{
    Person()
    {
        std::cout << "ctor: " << role() << '\n';
    }
    virtual ~Person()
    {
        std::cout << "dtor: " << role() << '\n';
    }
    virtual const char* role() const
    {
        return "Person";
    }
};

struct Student : Person
{
    const char* role() const override
    {
        return "Student";
    }
};

int main()
{
    Student student;
    std::cout << "ready: " << student.role() << '\n';
}
```

```text
ctor: Person
ready: Student
dtor: Person
```

执行 `Person` 的构造函数时，`Student` 自己的部分还没初始化；执行 `~Person()` 时，那部分已经销毁了。所以这两处都调用 `Person::role()`，只有中间对构造完成的对象调用时才打印 `Student`

这里不是说构造函数和析构函数里「完全没有虚函数」。更准确地说，对正在构造或析构的对象，虚调用以**当前正在执行构造或析构的那一层**为准，不会跳到更派生的类。如果这个调用在当前层落到纯虚函数，就是未定义行为，哪怕该纯虚函数另外提供了定义

顺带区分：**构造函数本身不能是虚函数，析构函数可以**。创建对象时，`Student student;` 或 `new Student` 已经选定要构造的类型；删除时，手上的 `Base*` 却可能指向不同派生对象，所以才需要虚析构去选销毁的入口

## 虚函数表和虚指针：编译器到底怎么找到函数？

这一节单独写个小程序，直接在 Visual Studio 里看一次虚调用

基类有两个虚函数，两个派生类都只重写第一个，第二个留着用基类的版本

```cpp
#include <iostream>

class Base
{
public:
    virtual void func1()
    {
    }

    virtual void func2()
    {
    }
};

class Derived : public Base
{
public:
    void func1() override
    {
        std::cout << "Derived\n";
    }
};

class Derived2 : public Base
{
public:
    void func1() override
    {
        std::cout << "Derived2\n";
    }
};

int main()
{
    Derived first;
    Derived2 second;
    Base* p = &first;
    Base* q = &second;

    p->func1();
    q->func1();
    return 0;
}
```

两行分别输出 `Derived` 和 `Derived2`

### 快速监视：表里到底放了什么？

用 Visual Studio 的 Debug x64 配置，在 `p->func1();` 处打断点，暂停后选中 `p`，按 Shift+F9 打开「快速监视」

展开 `p`，可以看到它声明为 `Base*`，但当前指向的是一个 `Derived` 对象

![Visual Studio 快速监视：展开 p 的 __vfptr，看到 Derived::func1 和 Base::func2](/img/posts/cpp-virtual-vfptr.png)

图里的 `__vfptr` 就是 MSVC 展示的{% annotation "对象中指向虚函数表的隐藏指针" %}虚指针（vptr）{% endannotation %}，它指向一张记录虚函数入口的表，这张表叫{% annotation "记录虚函数入口的表，同一类的对象共用" %}虚函数表（vtable）{% endannotation %}

看 `Derived` 虚表的两个{% annotation "虚表中的一个位置，存放对应虚函数的入口地址" %}表项{% endannotation %}：

- `[0]` 指向 `Derived::func1`，这个函数被重写了
- `[1]` 仍指向 `Base::func2`，这个函数没被重写

**虚指针在对象里，虚表不在对象里**。同一类的两个完整对象构造结束后，通常各自保存一份虚指针，指向同一份表。重写更多虚函数，通常是表项变了，不是每个对象多出几根指针

常见实现会在构造、析构的不同阶段设置虚指针，让它反映当前这一层。这能解释上面构造时为什么没跳到 `Student::role()`，不过派发规则由语言保证，不是靠某一种虚表布局才成立

==C++ 保证虚调用选对函数，但没规定编译器一定要用虚表，也没规定虚指针一定放在对象开头==

### 反汇编：从调用处跟进去（进阶）

停在 `p->func1();` 时打开「反汇编」，它会把程序里的机器指令显示成能读的汇编。第一次看不用读整屏，盯着红框这四行就够了

![Visual Studio 反汇编：p->func1() 处读取虚指针并根据表项调用](/img/posts/cpp-virtual-call-site.webp)

```asm
mov rax, qword ptr [p]
mov rax, qword ptr [rax]
mov rcx, qword ptr [p]
call qword ptr [rax]
```

第二行执行后，`rax` 里是虚表地址。第三行把 `p` 放进 `rcx`，作为成员函数里的 `this`，也就是当前对象的指针。最后一行从虚表的第一项读出函数地址，再调用它

在 `call` 处单步步入，可以看到执行进入 `Derived::func1()`：

![Visual Studio 步入虚调用后停在 Derived::func1 的反汇编](/img/posts/cpp-virtual-call-target.webp)

这就是**间接调用**：`call` 的目标不是指令里写死的，而是从表里读出来的。`q->func1()` 也查第一个表项，但拿到的是另一张表里的 `Derived2::func1`

面试问虚调用的代价，可以说通常多了读虚指针、读表项和间接跳转，编译器也可能更难内联。但如果编译器能证明目标唯一，就可以改成直接调用，这叫**去虚拟化**，所以写了 `virtual` 不等于每次都查表

### 虚指针会让对象变大吗？

`sizeof` 可以读出一个类型的对象占多少字节

下面对比空类、只有一个虚函数的类和一个指针的大小

```cpp
#include <iostream>

struct Empty
{
};

struct HasVirtual
{
    virtual void ping()
    {
    }
};

int main()
{
    std::cout << sizeof(Empty) << '\n';
    std::cout << sizeof(HasVirtual) << '\n';
    std::cout << sizeof(void*) << '\n';
}
```

在 Windows x64 的 MinGW-w64 GCC 8.1 上，输出是 `1`、`8`、`8`。空类本身也占 1 字节，两个类的大小差了 7 字节，但这个例子里的虚指针仍然占 8 字节。换个类或编译环境，`sizeof` 的差值不一定相同

### 多重继承时，为什么还要调整 this？

如果 `Both` 同时继承 `Left` 和 `Right`，一个 `Both` 对象里就有两个基类子对象，也就是两个基类各自的那一部分。把 `Both*` 转成 `Right*`，指针指向的是 `Right` 那一部分，不保证和完整对象同址

比如 `Both` 重写了 `Right::run()`，通过 `Right*` 调用它时，派生类实现需要的却是 `Both*`。常见实现会让表项先指向一小段代码，把传进来的 `this` 调整到 `Both` 的位置，再跳进 `Both::run()`，这段代码叫{% annotation "多继承中先调整 this、再跳到真正函数的代码" %}thunk{% endannotation %}

所以一个对象可能有不止一个虚指针，不能把单继承截图里的「对象开头有一个虚指针」背成通用规则。{% annotation "编译器约定对象布局、参数传递和调用方式的规则" %}ABI{% endannotation %} 就是这套约定

**虚继承和虚函数解决的是两个问题**。假设 `Left` 和 `Right` 都继承 `Root`，而 `Both` 又继承它们，普通继承会留下两份 `Root`。把两条到 `Root` 的继承都改成虚继承，`Both` 里就共享一份 `Root`。虚继承决定基类子对象是否共享，虚函数决定调用哪个版本

## 参考资料

1. 程序员陈子青.  
   C++高频面试-虚函数表的底层原理与内存布局 —— 一个视频带你彻底理解虚函数表机制[EB/OL].  
   Bilibili, 2025-03-11  
   [2026-11-18]. https://www.bilibili.com/video/BV1mBRLYeE6R.
2. 爱编程的大丙.  
   一个类只要有了虚函数，析构就必须是虚的吗？[EB/OL].  
   Bilibili, 2026-11-17  
   [2026-11-18]. https://www.bilibili.com/video/BV1qgsz6KEiN.
3. Z_Coding.  
   学C++必看：一个视频带你搞懂：虚函数、虚函数表、虚指针[EB/OL].  
   Bilibili, 2026-07-06  
   [2026-11-18]. https://www.bilibili.com/video/BV1DyTQ6UEty.

- cppreference：[Virtual function](https://en.cppreference.com/w/cpp/language/virtual.html)、[delete expression](https://en.cppreference.com/w/cpp/language/delete.html)
- C++ Core Guidelines：[C.35：基类析构函数的设计](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#Rc-dtor-virtual)


