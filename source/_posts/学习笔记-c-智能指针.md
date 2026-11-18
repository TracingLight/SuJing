---
title: 智能指针详解（大长篇）
date: '2026-11-15 20:30:00'
updated: '2026-11-17 20:07:23'
categories:
  - 学习笔记
tags:
  - C++
  - 智能指针
description: >-
  这篇博客详细讲解了C++智能指针的所有权语义，重点介绍了unique_ptr、shared_ptr和weak_ptr的用法、实现原理及常见陷阱（如重复释放、循环引用泄漏），并给出函数传参时的选择建议。
cover: /img/covers/preview-upscaled-4x-mwcw4ozn.webp
copyright: true
---

# 智能指针详解

观前提醒：请先阅读[RAII详解（长篇）](/2026/11/08/学习笔记-c-raii/)和[移动语义和右值引用](/2026/11/12/学习笔记-c-移动语义-右值引用/)



> 给裸指针套上一层类，在析构函数里写一句 `delete`，就能防止内存泄漏了吗？如果真这么简单，C++ 为什么还要折腾出 `unique_ptr`、`shared_ptr` 和 `weak_ptr`？更离谱的是，有时候你明明全程用了智能指针，对象依然一个都没有释放？！

## 已经学过 RAII，为什么还会重复释放？

前两篇我们分别聊过 `RAII` 和移动语义：前者让资源跟着管理对象一起清理，后者让某些资源可以转移所有权，避免不必要的深拷贝

把它们组合起来，似乎智能指针已经呼之欲出了

```cpp
class IntOwner {
public:
    explicit IntOwner(int* p) : ptr(p) {}
    ~IntOwner() { delete ptr; }

private:
    int* ptr;
};
```

看起来很合理，构造时接管地址，析构时释放，提前 `return` 和正常的异常栈展开也能帮忙调用析构函数

但只要加上一行：

```cpp
IntOwner a(new int(42));
IntOwner b = a;  
```

翻车了

两份管理对象保存同一个地址，离开作用域时各自执行 `delete`，导致重复释放，这是未定义行为

问题出在哪里？析构函数确实被调用了，甚至调用得过于积极

**`RAII` 解决了把清理动作放在哪里，但你仍然需要决定这份资源归谁管，以及复制管理对象意味着什么**

==这就是智能指针最重要的一层：所有权语义==

需要补充一句，`RAII` 不要求管理对象一定在栈上。它也可以是另一个对象的成员，或者被其他所有者间接管理。关键是管理对象自身的生命周期也必须受到正确管理；如果 `new` 出一个管理对象后把它泄漏，析构函数当然没有机会替你收尾

## 所有权归属

假设你写了一个处理图片的程序，一张图片要被预览窗口、导出函数、压缩函数访问

三个地方都要访问，就需要三个所有者吗？

不一定

如果程序结构已经保证：图片归编辑器所有，所有处理都在编辑器的有效生命周期内完成，那么其他函数借用图片即可

```cpp
struct Image
{
	//压缩图片
	void compress(){}
};
//导出图片
void exportImage(const Image& img)
{

}

auto image = std::make_unique<Image>();
image->compress();
exportImage(*image);
```

这里有多个使用者，但只有一个负责生命周期的所有者

**能访问对象，不等于必须参与决定对象什么时候销毁**

标准库把「谁负责释放这件事」做成了几种现成的工具

不必一次全记住，我们先从最简单、也最常用的独占所有权 `unique_ptr` 开始

需要多个所有者、以及只想观察对象而不延长它生命周期的情况，后面会逐个讲到，结尾有一张对照表

顺带一提，裸指针 `T*` 和引用 `T&` 在现代 C++ 里通常只表达借用，也就是我不负责释放，只是用一下的意思

==但这只是接口约定，语言并不会禁止你用裸指针拥有资源，老式 C 接口也常常用裸指针交付所有权==

![unique_ptr 的独占所有权与 shared_ptr 的共享所有权对比](/img/posts/smart-01-ownership.png)

## unique_ptr：独占所有权，不可复制只能移动

先来看最自然的情况，一份资源只由一个所有者管理

`std::make_unique<int>(42)` 是创建 `unique_ptr` 的推荐写法

它分配一个 `int` 并立刻交给 `unique_ptr` 管理，你不用自己写 `new`

```cpp
#include <memory>
#include <utility>
//这里的auto是让编译器按右边的表达式推导类型，这里推导类型为unique_ptr<int>
auto p = std::make_unique<int>(42);
//编译错误，不允许复制所有权
auto copy = p;
//允许利用移动语义来转移所有权，转移后p为空，q拥有了原来p的所有权，也就是q管理现在的int对象
auto q = std::move(p);
```

`unique_ptr` 禁用拷贝构造和拷贝赋值，支持移动构造和移动赋值

这与上一篇正好接上，`std::move(p)` 本身只是类型转换，真正把地址赋值过去、把源指针变为空的，是 `unique_ptr` 的移动操作

注意，这里的源指针变为空是 `unique_ptr` 对移动后状态的明确保证，不能把它扩展成所有类型移动后都会被清空

C++98 曾提供 `auto_ptr`，同样表达独占所有权，但它允许拷贝：拷贝构造和拷贝赋值会把所有权从源对象转给新对象，源对象变为空

这种「拷贝即转移」的语义很隐蔽，容器复制元素、按值传参都会在不显眼处转走所有权，容易留下悬空访问

C++11 引入移动语义后以 `unique_ptr` 取代它：转移必须显式 `std::move`，拷贝直接编译错误；`auto_ptr` 于 C++11 被弃用、C++17 移除，新代码不应再使用

到了这里，它为什么叫「独占」也就清楚了

**独占的是释放责任，不是访问权限，一个 `unique_ptr` 管理的对象，完全可以被多个裸指针或引用临时访问**

但借用者不会自动延长对象寿命

```cpp
auto owner = std::make_unique<int>(32);
//get()：为借出内部资源地址，也就是返回资源地址，不交出所有权
int* observer = owner.get();

int value = *observer;
//reset()：释放内部资源，也就是删除所管理的对象，将指针置为空
owner.reset();

//此时指针已经悬空，访问会导致未定义行为
int bad = *observer;
```

==智能指针不会扫描全程序，找到所有指向这块内存的裸指针，再把它们统一置空，所以要注意==

### get、release、reset 的区别

`get()` 返回存储的指针，不交出所有权，也不增加任何生命周期保证

`release()` 返回指针，并让这个 `unique_ptr` 放弃所有权，智能指针对象变为空，但不会删除管理的资源对象

`reset()` 放弃当前所有权，并删除原来管理的对象，带新指针的重载还会接管新指针

这里说的删除默认就是 `delete`

智能指针其实允许你把清理动作换成别的（比如关闭文件），这个可替换的清理动作叫**删除器**，后面会专门讲

```cpp
auto p = std::make_unique<int>(10);
//p为空，但是int对象还在
int* raw = p.release();
//立即建立新的所有者
std::unique_ptr<int> q(raw);
//q不仅放弃所有权且释放资源
q.reset();
```

这个例子只是为了对比接口，日常在两个 `unique_ptr` 之间交接，直接移动更清楚，不必绕一圈裸指针

`release` 中释放的是管理责任，`reset` 才会释放原资源，不要根据英文名称**想当然**

```cpp
//reset如果传参是先 delete 旧资源 → 再把内部地址换成传入的新指针
//故而下面的是错误操作，会接管已经被delete的资源
p.reset(p.get());
//手动释放也是错误的，因为p并未放弃所有权，所以会在p析构时再次delete，导致重复释放
delete p.get();
```

### 手写一个简化版 unique_ptr

下面是仅用于理解的独占指针，管理单个 `new T` 对象，不支持数组、自定义清理方式等完整标准库接口

```cpp
#include <iostream>
using namespace std;

template<class T>

class MiniUnique
{
public:
	MiniUnique(T* p) noexcept :ptr(p)
	{
		cout << "MiniUnique constructor" << endl;
	}
	~MiniUnique()
	{
		cout << "MiniUnique destructor" << endl;
		delete ptr;
	}

	//禁止拷贝构造和拷贝赋值
	explicit MiniUnique(const MiniUnique& other) noexcept = delete;
	MiniUnique<T>& operator=(const MiniUnique& other) = delete;


	//允许移动构造和移动赋值
	MiniUnique<T>& operator=(MiniUnique<T>&& other) noexcept
	{
		if (this != &other)
		{
			//先释放自身资源
			delete ptr;
			//依然是release移交所有权
			ptr = other.release();
		}
		return *this;
	}

	//这里的移动构造直接release移交所有权即可
	MiniUnique(MiniUnique<T>&& other) noexcept :ptr(other.release())
	{

	}

	T* get() const noexcept
	{
		return ptr;
	}

	T* release() noexcept
	{
		//放弃所有权
		T* temp = ptr;
		ptr = nullptr;
		return temp;
	}

	void reset(T* p = nullptr)
	{
		if (p != ptr)
		{
			delete ptr;
			ptr = p;
		}
	}

	//重载*和->运算符
	T& operator*() const noexcept
	{
		return *ptr;
	}

	T* operator->() const noexcept
	{
		return ptr;
	}
private:
	T* ptr;
};
```

==没有后台线程，也没有内存扫描，它只是利用了构造、析构、禁用拷贝和移动语义==

用默认删除器时，`unique_ptr<T>` 在常见实现中通常就和一个裸指针一样大，访问对象也没有额外的间接层

所谓零开销，不是说构造和 `delete` 不花时间，而是相比你自己手写的同等管理代码，它不引入引用计数等额外开销（带自定义删除器时体积可能变大，那是进阶话题）

## shared_ptr：共享所有权，最后一个所有者负责释放

`unique_ptr` 表达的是独占所有权，一个对象只有一个所有者，其他所有者想要接管，就必须通过移动完成交接

但有些对象需要被多个相互独立的部分共同持有，例如多个异步任务都保存着同一个对象，每个任务都可能最后结束，无法提前指定由哪一个任务负责销毁

这时可以让每个任务都持有一份所有权，只要还有任务没有结束，对象就继续存活，最后一个任务结束时才销毁对象

`shared_ptr` 表达的就是这种共享所有权

```cpp
auto a = std::make_shared<int>(10);//a成为第一个所有者，引用计数为1

auto b = a;//b加入所有权组，引用计数变为2

auto c = std::move(b);//b把所有权转交给c，引用计数仍然为2

a.reset();//a退出，引用计数变为1，int对象不会销毁

c.reset();//最后一个所有者退出，引用计数归0，int对象被销毁
```

`auto b = a` 不会复制出另一个 `int` 对象，而是让 `b` 和 `a` 共同拥有同一个 `int` 对象

```cpp
auto a = std::make_shared<int>(10);
auto b = a;

*b = 20;

std::cout << *a << '\n';//20
```

移动则只是转交所有权，`b` 退出所有权组，`c` 接替 `b`，所有者总数没有变化，所以引用计数不变

### 控制块的作用

为了判断最后一个所有者何时退出，`shared_ptr` 需要记录当前有多少个所有者，这个数量称为引用计数

计数不能放进被管理的 `int` 对象里，因为 `int` 没有给标准库预留这样的字段

也不能让每个 `shared_ptr` 各自保存一份计数，否则复制时只修改新指针的计数，原来的指针无法知道所有者数量已经变化

因此，同一份计数必须放在所有所有者都能找到的地方，这份共享的管理信息称为控制块

一个 `shared_ptr` 可以简化理解为保存两个地址：

```cpp
T* ptr;//被管理对象的地址
ControlBlock* control;//共享控制块的地址
```

复制 `shared_ptr` 时，复制的是这两个地址，多个 `shared_ptr` 的 `control` 指向同一个控制块，因此它们修改的是同一份计数

==引用计数不是编译器自动维护的，而是 `shared_ptr` 的构造、赋值、析构和 `reset()` 共同维护的==

### 手写一个简化版 shared_ptr

下面是仅用于理解的共享指针，管理单个 `new T` 对象，不支持数组、自定义删除器、`weak_ptr` 和线程安全等完整标准库功能

```cpp
#pragma once

template <class T>
class MiniShared
{
public:
	//explicit主要为了防止裸指针隐式转换
	explicit MiniShared(T* p=nullptr) : ptr(p)
	{
		//只有实际管理资源（对象）时才新建控制块
		if (ptr != nullptr)
		{
			//此刻控制块自动初始化为1
			control = new ControlBlock();
		}
	}
	~MiniShared()
	{
		release();
	}
	//拷贝构造和拷贝赋值
	//复制拷贝对象地址和控制块地址
	MiniShared(const MiniShared& other): ptr(other.ptr),control(other.control)
	{
		//当前对象也加入所有权组
		if (control != nullptr) ++control->count;
	}

	MiniShared& operator=(const MiniShared& other)
	{
		//避免自赋值
		if (this == &other) return *this;

		//如果控制块有效，增加引用计数
		if (other.control != nullptr) ++other.control->count;
		//先释放自身资源
		release();

		ptr = other.ptr;
		control = other.control;

		return *this;
	}


	//移动构造和移动赋值，移动构造和赋值是不增加引用计数的
	MiniShared& operator=(MiniShared&& other) noexcept
	{
		if (this == &other) return *this;
		release();
		ptr = other.ptr;
		control = other.control;
		other.ptr = nullptr;
		other.control = nullptr;
		return *this;
	}

	MiniShared(MiniShared&& other) noexcept : ptr(other.ptr), control(other.control)
	{
		//放弃管理资源和控制块
		other.ptr = nullptr;
		other.control = nullptr;
		//所有者只是放弃资源所有权，引用计数不变
	}

	size_t use_count() const
	{
		return control == nullptr ? 0 : control->count;
	}



	void reset()
	{
		release();
	}

	//重载运算符

	T* operator->() const
	{
		return ptr;
	}

	T& operator*() const
	{
		return *ptr;
	}
	T* get() const
	{
		return ptr;
	}
private:
	struct ControlBlock
	{
		//新建控制块时，当前指针是第一个所有者
		size_t count = 1;
	};
	//保存管理资源的地址
	T* ptr = nullptr;
	//保存共享的控制块地址
	ControlBlock* control = nullptr;
	//控制块让多个MiniShared对象共享同一份计数

	void release()
	{
		//如果对象没有管理任何资源，直接返回
		if (control == nullptr) return;

		--control->count;

		if (control->count == 0)
		{
			delete ptr;
			delete control;
		}

		ptr = nullptr;
		control = nullptr;
	}
};
```

拷贝构造复制对象地址和控制块地址，然后让共享计数加 1，表示当前对象也加入了所有权组

移动构造同样接管这两个地址，但会把 `other` 置空，因此只是所有权交接，不会增加计数

赋值比构造多了一步 `release()`，因为当前对象可能已经管理着另一个对象，必须先退出原来的所有权组，不能直接覆盖原来的地址

拷贝赋值会先增加 `other` 所在组的计数，再释放当前对象的旧所有权，移动赋值则不会增加新所有权组的计数

`release()` 也不是无条件删除对象，它先把计数减 1，只有计数归 0时才执行 `delete ptr`

这里的 `release()` 只是类内部复用的辅助函数，对外主动放弃所有权使用的是 `reset()`，不要把它和 `unique_ptr::release()` 混在一起

==拷贝会增加所有者，移动只转交所有权，析构和 `reset()` 会让当前所有者退出，最后一个所有者才负责销毁对象==

当前版本还没有观察者，所以计数归 0时会连同控制块一起释放，等后面引入 `weak_ptr`，对象和控制块的释放时机就需要分开处理

### 同一个地址，为什么不能重新包装？

```cpp
int* raw = new int(12);
std::shared_ptr<int> p1(raw);
//这里是错误的,p2会另建一个控制块，从裸指针构造一律新建控制块（地址反查不到已有管理）
//那么析构时都会以为自己是唯一的所有者，都会delete，导致重复释放
std::shared_ptr<int> p2(raw);
```

`p1` 和 `p2` 虽然存储相同地址，却各自建立一份管理状态，都认为自己有权在最后执行删除

标准库不会按地址维护一个全局登记表，自动发现这块内存原来已经有人管了

正确做法是复制已有所有者

```cpp
auto a = std::make_shared<int>(42);
auto b = a;
```

同样，不要写 `std::shared_ptr<int> b(a.get());`，也不要把同一个地址同时交给 `unique_ptr` 和一个独立的 `shared_ptr` 管理

如果需要从独占转成共享，可以显式转移

```cpp
auto u = std::make_unique<int>(42);
std::shared_ptr<int> s(std::move(u));
//u 为空，s 成为共享所有者
```

反方向（共享转独占）没有通用的自动接口，日常也基本用不到，这里不展开

### 访问的地址，未必是最终要删除的地址（进阶选读）

这一小节解释控制块为什么要存两个指针，第一遍可以跳过，不影响后面阅读

如果一直只看 `shared_ptr<int>`，你可能会觉得保存两种地址信息有些多余

看看别名构造就知道了

```cpp
struct Whole 
{
    int value = 42;
};

auto owner = std::make_shared<Whole>();
//这里的part是owner的一个共享所有者，owner和part都拥有Whole对象的所有权
//这里的构造参数是一个共享所有者和一个指向资源的裸指针，不新建控制块，与 owner 共享同一份管理状态，只是存储指针指向成员
std::shared_ptr<int> part(owner, &owner->value);

owner.reset();
//此时part仍然拥有Whole对象的所有权，Whole对象不会被释放，*part仍然可以访问Whole对象的value成员
part.reset();
//此时part放弃了Whole对象的所有权，Whole对象的引用计数为0，Whole对象被释放
```

`part.get()` 指向成员，但共享的所有权组管理的是 `Whole`

**访问哪里，由存储指针决定，最后清理什么，由共享管理关系决定**

![shared_ptr 的元素指针、控制块和别名构造](/img/posts/smart-02-control-block.png)

这个工具也有边界，别名指针必须在所维持的生命周期内保持有效，比如指向 `vector` 元素的地址，即使让 `vector` 对象一直存活，也可能因为扩容而失效，让容器存活不等于固定住元素地址

再深一层，别名构造甚至允许「有所有权但存储指针为空」，或者反过来。所以 `if (p)` 判断的是指针非空，不完全等于还有所有权

日常用不到，了解即可

## weak_ptr：观察对象而不延长其生命周期

有时候，一个对象只是想知道另一个对象是否还活着，并在它活着的时候访问一下，却不希望自己的存在延长对方的生命周期

如果它持有 `shared_ptr`，就已经参与了所有权，只要它不退出，对象就不会销毁

但如果只保存裸指针，对象销毁后，它也无法从裸指针本身得知这件事

`weak_ptr` 用来表达的就是这种关系：**只观察，不拥有**

```cpp
std::weak_ptr<int> observer;//创建一个暂不观察任何对象的weak_ptr

{
    auto owner = std::make_shared<int>(10);
    observer = owner;//observer开始观察owner管理的int对象，但不增加强计数

    if (auto hold = observer.lock())
    {
        //lock成功后会返回一个新的shared_ptr，hold也加入了所有权组
        owner.reset();//owner退出，但hold仍然拥有int对象，所以对象不会销毁

        std::cout << *hold << '\n';//10
    }
    //hold析构，此时它是最后一个所有者，int对象被销毁
}

auto hold = observer.lock();//int对象已经销毁，lock返回空的shared_ptr
```

`owner.reset()` 后对象没有销毁，不是因为 `observer` 延长了它的生命周期，而是因为 `lock()` 创建的 `hold` 仍然是所有者

==`weak_ptr` 本身不延长对象寿命，但 `lock()` 成功时返回的 `shared_ptr` 会取得一份临时的强所有权==

`lock()` 能否成功，也不是看原来的 `owner` 变量是否还存在，而是看同一所有权组中是否还有 `shared_ptr`

即使原来的 `owner` 已经退出，只要还有其他所有者，对象就仍然活着，`lock()` 就可以成功

如果强计数已经归 0，对象已经销毁，`lock()` 只会返回空的 `shared_ptr`，不会把已经销毁的对象复活

### 为什么 weak_ptr 不能直接解引用

`weak_ptr` 没有 `operator*` 和 `operator->`

因为它并不拥有对象，仅仅保存观察关系，不能保证下一次访问时对象还活着

所以访问前必须先调用 `lock()`，尝试取得一份强所有权

```cpp
if (auto hold = observer.lock())
{
    //hold存活期间，当前对象至少还有hold这个所有者
    int value = *hold;
}
else
{
    //对象已经销毁，不能通过observer访问它
}
```

这样做以后，对象是否存活就不再依靠提前假设，而是由 `lock()` 的实际结果决定

### 为什么不能先 expired，再访问？

`expired()` 可以检查对象是否已经销毁，但检查结果只代表检查发生时的状态

```cpp
if (!observer.expired())
{
    //即使这里判断对象还活着，其他线程也可能随后释放最后一个shared_ptr
}

if (auto hold = observer.lock())
{
    //直接使用lock返回的hold
}
```

如果先检查 `expired()`，再根据检查结果使用之前保存的裸指针，检查和访问之间仍可能发生变化

`lock()` 则把“检查对象是否还活着”和“活着就取得一份所有权”合成了一次原子操作

这里的原子只针对取得所有权这件事，不代表对象内部的业务数据也自动变成了线程安全

### 对象销毁后，weak_ptr 怎么知道它已经不存在了？

因为对象销毁后，控制块不一定马上销毁

只要还有 `weak_ptr` 在观察，控制块就会保留必要的管理信息，让这些观察者能够知道对象已经销毁，并让后续的 `lock()` 安全地返回空

因此，对象的生命周期和控制块的生命周期是两件事

强计数归 0时，被管理对象销毁

如果此时还有弱观察者，控制块继续保留；当这些管理信息也不再被需要时，控制块才会释放

为了和 `shared_ptr` 的强计数区分，`weak_ptr` 对应的观察计数可以称为弱计数，弱计数不参与决定对象何时销毁，只参与决定控制块何时释放

==强计数决定对象还能活多久，弱观察状态让观察者在对象销毁后仍能安全得知这个结果==

这种只观察、不拥有的关系，也正好可以用来打破 `shared_ptr` 形成的循环所有权

## 全用了智能指针，为什么还是泄漏？

看下面这段代码，为了方便描述，把 `a` 管理的节点称为 A，把 `b` 管理的节点称为 B

```cpp
struct Node
{
    std::shared_ptr<Node> next;
};

{
    auto a = std::make_shared<Node>();//A的强计数为1
    auto b = std::make_shared<Node>();//B的强计数为1

    a->next = b;//A.next也拥有B，B的强计数变为2
    b->next = a;//B.next也拥有A，A的强计数变为2
}
```

离开作用域时，局部变量 `a` 和 `b` 都会析构，但它们管理的 A 和 B 不一定会析构

`b` 析构后，B 的强计数从 2 减到 1，剩下的所有者是 `A.next`

`a` 析构后，A 的强计数也从 2 减到 1，剩下的所有者是 `B.next`

此时两个节点都无法销毁，因为它们的强计数都没有归 0

而 `A.next` 和 `B.next` 又不是当前作用域里的局部变量，它们分别是 A 和 B 的成员，只有所属节点析构时，它们才会跟着析构

于是，A 无法析构，`A.next` 就无法析构，B 的计数就不会继续下降

B 同样无法析构，`B.next` 也无法析构，A 的计数同样不会继续下降

==不是局部变量 `a` 和 `b` 没有析构，而是它们析构后，两个节点各剩一个来自对方成员的所有者，两个计数都停在了 1==

### 引用计数不判断对象的可达性

人一眼就能看出，外部已经没有办法访问这两个节点了

但引用计数不会遍历对象之间的关系，也不会判断一个对象是否已经无法从外部访问，它只在所有者退出时减少计数

因此，即使两个节点在业务上已经没用了，只要它们仍然互相持有，引用计数就不会把它们判定为可以释放

### 把其中一条边改成 weak_ptr

如果 B 只是需要知道 A 是谁，并不需要决定 A 的生命周期，就不要让 B 持有 A 的强所有权

```cpp
struct Node
{
    std::shared_ptr<Node> next;
    std::weak_ptr<Node> prev;
};

{
    auto a = std::make_shared<Node>();//A的强计数为1
    auto b = std::make_shared<Node>();//B的强计数为1

    a->next = b;//A拥有B，B的强计数变为2
    b->prev = a;//B只观察A，A的强计数仍然为1
}
```

离开作用域时，`b` 先析构，B 的强计数从 2 减到 1，暂时不会销毁

随后 `a` 析构，A 的强计数从 1 减到 0，A 开始析构

A 析构时，它的成员 `A.next` 也会析构，于是 B 的强计数从 1 减到 0，B 接着析构

==`weak_ptr` 不会自动寻找并解开循环，它只是让其中一条关系不再增加强计数，使强所有权环从一开始就没有形成==

## 函数参数：按所有权语义选择传参方式

三种工具都已介绍，现在回头看接口设计，这一节是收尾，读完即可掌握智能指针的日常用法

如果函数只是同步读取一个对象，不保存地址也不决定生命周期

```cpp
void inspect(const Widget& value);
```

如果允许没有对象，可以用非拥有指针表达

```cpp
void inspectOptional(const Widget* value);
```

如果函数要接走独占所有权

```cpp
void consume(std::unique_ptr<Widget> value);

//consume(std::move(owner));
```

如果函数要参与共享所有权，比如把对象保存在异步任务中

```cpp
void schedule(std::shared_ptr<Widget> value);
```

如果需要修改调用方的智能指针变量，让它改管另一个对象，才考虑智能指针的非常量引用

不是参数里出现智能指针才叫现代 C++

一个只是读取数据的函数，接收 `const Widget&`，通常比要求调用方提供 `shared_ptr<Widget>` 更直接，也不把调用方的所有权方案绑死

### const 智能指针不等于 const 对象

```cpp
const auto p = std::make_unique<int>(10);
*p = 20; //不能重新安排 p 的所有权，不代表 int 不可修改

std::unique_ptr<const int> q = std::make_unique<int>(10);
//*q = 20; 
//通过 q 看到的是 const int
```

`const std::shared_ptr<T>&` 也不自动提供一份独立维持对象存活的副本

如果函数调用过程中可能通过其他路径重置原来的所有者，需要在合适位置先复制一份本地 `shared_ptr`，再借用对象进行调用

选择按值还是按引用，先看你要表达的生命周期语义，再考虑减少哪一次计数操作

## make_shared：通常少一次分配，但理由要准确

日常创建用 `make_unique` / `make_shared` 这个结论，前面其实一直在用

本节解释为什么，以及几个容易说错的细节，第一遍记住推荐用 make_shared即可，异常安全、合并分配代价等进阶细节可以跳过

推荐写法是这样：

```cpp
auto u = std::make_unique<Widget>(args...);
auto s = std::make_shared<Widget>(args...);
```

`make_shared` 从 `C++11` 就有，`make_unique` 从 `C++14` 加入标准库

直接写 `std::shared_ptr<T>(new T)` 时，对象存储已经由 `new T` 分配，标准库通常还要分配控制块

`make_shared<T>` 则可以在一次分配中同时容纳控制块和对象，常见实现正是这样做的，标准草案也建议实现不超过一次内存分配

好处是减少分配管理开销，可能改善局部性，也让对象创建和建立所有权写在同一个表达式里

实际收益取决于分配器、对象大小、缓存行为和使用方式

### 控制块分配失败，裸 new 写法一定会泄漏吗？（进阶）

不会，这是个常被说反的点

```cpp
std::shared_ptr<Widget> p(new Widget);
```

如果对象构造成功、随后分配控制块失败，标准要求清理传入的对象，不会直接泄漏

真正经典的旧问题在 `C++17` 之前：复杂函数调用里各参数的求值可能交错

```cpp
consume(std::shared_ptr<Widget>(new Widget), mayThrow());
```

旧规则下可能先 `new Widget`，再执行会抛异常的 `mayThrow()`，此时管理者还没构造，对象就泄漏了

`make_shared` 把分配和建立管理放进一次函数调用，避开了这个窗口

`C++17` 起参数初始化之间不再允许这种交错（谁先谁后仍未固定），所以这个例子不能不加说明地当作现代 C++ 必然泄漏的证据

### 合并分配有没有代价？（进阶）

有，最典型的就是长寿命 `weak_ptr`

当强所有者全部退出时，`make_shared` 创建的对象仍然会按时析构，不会因为弱观察者还在，就推迟对象析构

但是对象和控制块合并占用的那一整块存储，可能要等弱观察者也结束后才能归还

所以应区分：对象已析构、对象内部资源已清理、承载对象的整块存储已归还

例如对象内部的 `vector` 在对象析构时就会释放自己的缓冲区

如果对象自身内嵌巨大数组，那么合并存储保留就可能占住相当多空间

另外，`make_shared` 不接受自定义删除器。如果你需要定制清理动作，或依赖特定的内存分配路径，就改用 `shared_ptr<T>(new T)` 的写法

## 文件、数组、继承的清理规则（进阶）

智能指针的清理动作不必永远是 `delete`

```cpp
#include <cstdio>
#include <memory>

struct FileCloser {
    void operator()(std::FILE* f) const noexcept {
        if (f) std::fclose(f);
    }
};

using FilePtr = std::unique_ptr<std::FILE, FileCloser>;

FilePtr file(std::fopen("data.txt", "r"));
if (!file) {
    // 处理打开失败
}
// 成功打开时，离开作用域自动 fclose
```

这只是最基本的关闭管理，`fclose` 本身可能报告错误，如果业务必须处理写回或关闭失败，应设计显式的提交/关闭与错误检查，不能指望析构函数替你可靠上报业务错误

删除器应按接口要求安全工作，不要从清理路径抛异常

`unique_ptr` 的删除器类型是自身类型的一部分

`shared_ptr` 则将删除策略放进共享管理机制，不同删除器仍可以得到同样的 `shared_ptr<T>` 类型

### 数组需要匹配数组的清理方式

```cpp
auto a = std::make_unique<int[]>(100);  // C++14
a[0] = 42;

std::shared_ptr<int[]> b(new int[100]{}); // C++17
b[0] = 42;

// C++20 起才可以这样用 make_shared 创建数组
// auto c = std::make_shared<int[]>(100);
```

不能把 `new T[n]` 随便交给默认按单个对象删除的 `unique_ptr<T>`

`delete` 和 `delete[]` 不匹配是未定义行为

日常动态数组通常优先考虑 `std::vector<T>`，因为它还表达了大小、支持迭代，并管理增长过程

智能数组指针并不等于一个功能齐全的容器

### 基类指针为什么还需要虚析构？

```cpp
struct Base {
    virtual ~Base() = default;
};

struct Derived : Base {};

std::unique_ptr<Base> p = std::make_unique<Derived>();
```

当用 `unique_ptr<Base>` 的默认删除器通过 `Base*` 删除派生对象时，通常的多态基类需要虚析构函数，智能指针不会改变普通 `delete` 的类型规则

`shared_ptr` 有个差别：用 `make_shared<Derived>()` 建立所有权时，它记住了派生类型的销毁方式，之后转成 `shared_ptr<Base>` 也能正确销毁，这条路径不依赖虚析构

但这只是某一条构造路径的便利：工程中多态基类该有虚析构仍要有，不能以此替代正常的类设计

## 不要用 shared_ptr(this)：enable_shared_from_this（进阶）

异步任务里经常有一种需求：对象希望把自己交给稍后执行的回调，以免回调触发时对象已经销毁

于是有人写：

```cpp
// 错误思路：return std::shared_ptr<Session>(this);
```

如果这个对象已经由其他 `shared_ptr` 管理，这又建立了一套独立的管理状态，和前面重复包装同一裸地址的问题完全一样

正确工具是 `enable_shared_from_this`

```cpp
#include <functional>
#include <memory>

class Session : public std::enable_shared_from_this<Session> {
public:
    std::function<void()> makeTask() {
        auto self = shared_from_this();
        return [self] {
            self->run();
        };
    }

private:
    void run() {}
};

auto session = std::make_shared<Session>();
auto task = session->makeTask();
session.reset();
task(); // 回调持有的 self 仍维持 Session 存活
```

它的思路可以理解为：类内部保存一份弱观察状态，在对象被兼容的 `shared_ptr` 正确接管时关联已有所有权组。`shared_from_this()` 再从这组关系中取得强所有权，不另造一个控制块

继承要使用公开、无歧义的合适基类，并且调用时对象已经由共享所有权管理

仅仅继承这个模板，不会让一个普通局部对象自动加入共享管理

```cpp
Session local;
// local.makeTask(); // 在这里 shared_from_this() 会抛 std::bad_weak_ptr
```

也别在构造函数里立刻调用 `shared_from_this()`，即使用 `make_shared` 创建对象，构造函数执行期间内部关联也尚未建立

### 回调也可能形成循环引用

上面的例子将回调交给外部持有，所以它可以按需要维持会话存活

如果对象又把捕获 `self` 的回调存进自己的成员，就形成了：

`Session → 回调 → shared_ptr<Session> → Session`

即使没有两个互相指向的类，环仍然存在

如果业务语义是对象活着就执行，不要求回调延长它的生命，可以改成弱捕获：

```cpp
std::function<void()> makeOptionalTask() {
    auto weak = weak_from_this();  // C++17，作为 Session 的成员函数
    return [weak] {
        if (auto self = weak.lock()) {
            self->run();
        }
    };
}
```

对象已销毁时，这个回调就不再执行相应操作。是否允许这样跳过任务，需要由业务决定，不能为了消除泄漏而擅自改变任务语义

## 引用计数线程安全，为什么程序还会出问题？（进阶）

这也是面试中容易回答不完整的问题

“`shared_ptr` 是线程安全的吗？”

先别急着答是或不是，你说的是哪一层？

### 第一层：不同指针对象，共享同一个控制块

```cpp
auto a = std::make_shared<int>(42);
auto b = a;

// 线程 1：a.reset();
// 线程 2：b.reset();
```

在正确发布这些对象、且各线程分别操作自己的指针实例的前提下，共享管理状态的协调由标准库保证，不会因为两个线程同时退出就重复删除对象

引用计数通常借助原子操作或实现提供的等价同步机制完成

### 第二层：多个线程访问同一个 shared_ptr 变量

```cpp
std::shared_ptr<int> current = std::make_shared<int>(42);

// 线程 1：auto local = current;
// 线程 2：current.reset();
```

这里读写的是同一个 `current` 对象，不是两个独立实例。缺少同步就可能发生数据竞争

你可以用互斥锁保护它，`C++20` 起也可以使用 `std::atomic<std::shared_ptr<T>>` 专门管理这个共享指针变量的原子读写，但不保证它在所有平台上都无锁

```cpp
// C++20；需要 <atomic> 和 <memory>
std::atomic<std::shared_ptr<const Config>> current;

void publish() {
    current.store(std::make_shared<Config>());
}

void readConfig() {
    auto snapshot = current.load();
    if (snapshot) {
        // 在 snapshot 维持生命周期期间读取配置
    }
}
```


### 第三层：被管理对象本身

```cpp
auto a = std::make_shared<int>(0);
auto b = a;

// 线程 1：++*a;
// 线程 2：++*b;
```

两份指针管理关系没出问题，指向的却是同一个普通 `int`，无同步并发修改仍然是数据竞争

需要用锁、原子业务字段或其他合适的同步设计

**控制块的安全、指针变量的安全、业务数据的安全，是三个问题**

顺便提醒，`use_count()` 不是并发锁，看见计数为 1，不代表后面不会有其他线程通过弱观察者取得强所有权，也不代表不存在裸指针或引用访问这份数据

最后一个所有者可能在哪个线程退出，对象的清理通常就在哪个线程发生

如果资源要求在特定线程释放，或者析构过程很重，还需要额外设计销毁调度

## 小结

不妨把开头的问题再问一遍

为什么 `unique_ptr` 不允许复制？因为复制独占所有权会制造两个释放责任人，所以用类型系统禁止，再通过移动完成交接

为什么 `shared_ptr` 需要控制块？因为多个所有者需要协调同一份生命周期状态，而且删除策略不能总从当前存储指针的类型和地址直接推出

为什么 `weak_ptr` 不直接提供解引用？因为不延长生命周期的观察者，不能凭一个地址保证下一刻对象还活着，所以先 `lock()`，再使用拿到的强所有者

为什么用了智能指针仍会泄漏？因为错误的所有权图依然可能有环；管理对象自身也可能被泄漏，`release()` 之后也可能再没人接管

那是不是把所有东西都换成 `shared_ptr` 就足够安全？实际并不是，它会带来控制块、计数协调和额外的生命周期耦合，也不会替你修复数组越界、数据竞争、悬空借用或错误删除策略

**先用普通对象、容器和清晰的成员关系表达生命周期，需要动态独占所有权时用 `unique_ptr`；确实需要多个独立所有者时用 `shared_ptr`；只观察共享对象而不延长其生命周期时用 `weak_ptr`**

开头欠的那张对照表，现在可以补上了：

| 工具 | 表达的关系 | 会不会维持对象生命周期 |
| --- | --- | --- |
| `unique_ptr<T>` | 独占所有权 | 会，直到释放或转交所有权 |
| `shared_ptr<T>` | 共享所有权 | 会，最后一个强所有者退出时清理 |
| `weak_ptr<T>` | 弱观察，不拥有 | 自身不会，访问前用 `lock()` 取得强所有权 |
| `T*`、`T&` | 借用 | 不会，由调用方保证有效期 |

理解智能指针之后，每次保存一个地址时，都能回答清楚：它由谁拥有，我是在借用还是在接管，以及我使用它的时候，凭什么保证它还活着

## 参考资料

1. C++ Core Guidelines：[资源管理规则](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#S-resource)，重点参考 R.20—R.24、R.30—R.37
2. 公开 C++ 标准工作草案：[unique_ptr](https://eel.is/c++draft/unique.ptr)、[shared_ptr 构造](https://eel.is/c++draft/util.smartptr.shared.const)与[工厂函数](https://eel.is/c++draft/util.smartptr.shared.create)、[weak_ptr 观察操作](https://eel.is/c++draft/util.smartptr.weak.obs)、[enable_shared_from_this](https://eel.is/c++draft/util.smartptr.enab)、[atomic<shared_ptr>](https://eel.is/c++draft/util.smartptr.atomic)
3. 书籍：《C++ Primer》第五版第 12 章的动态内存内容，《Effective Modern C++》的智能指针专题
4. 视频：部分来源b站
